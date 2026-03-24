const supabase = require('../services/supabase');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CLUB_AD_PLANS = new Set(['pro', 'premium']);
const WHITE_LABEL_PLAN = 'premium';

const ALLOWED_CONFIG_FIELDS = ['logo_url', 'white_label', 'config_visual'];
const ALLOWED_AD_FIELDS = ['image_url', 'link_url', 'location', 'active', 'sort_order'];
const VALID_LOCATIONS = new Set(['banner_bottom']);

// Resolves club_id: prefers req.authUser (more secure), falls back to query/header
const resolveClubId = (req) => {
  const fromAuth = String(req.authUser?.club_id || '').trim();
  if (fromAuth && UUID_REGEX.test(fromAuth)) return { clubId: fromAuth, error: null };

  const fromQuery = String(req.query?.club_id ?? req.headers?.['x-club-id'] ?? '').trim();
  if (!fromQuery) return { clubId: null, error: 'club_id es obligatorio.' };
  if (!UUID_REGEX.test(fromQuery)) return { clubId: null, error: 'club_id debe ser un UUID válido.' };
  return { clubId: fromQuery, error: null };
};

// ──────────────────────────────────────────────────────────────────────
// GET /api/club-config  (admin)
// ──────────────────────────────────────────────────────────────────────
const getConfig = async (req, res) => {
  const { clubId, error: clubError } = resolveClubId(req);
  if (clubError) return res.status(400).json({ error: clubError });

  const { data, error } = await supabase
    .from('clubes')
    .select('id, nombre, slug, logo_url, config_visual, plan, white_label')
    .eq('id', clubId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Club no encontrado.' });

  return res.json(data);
};

// ──────────────────────────────────────────────────────────────────────
// PATCH /api/club-config  (admin)
// ──────────────────────────────────────────────────────────────────────
const updateConfig = async (req, res) => {
  const { clubId, error: clubError } = resolveClubId(req);
  if (clubError) return res.status(400).json({ error: clubError });

  const updates = {};
  for (const field of ALLOWED_CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No hay campos válidos para actualizar.' });
  }

  // logo_url: requires Pro or Premium plan
  if (Object.prototype.hasOwnProperty.call(updates, 'logo_url')) {
    if (updates.logo_url !== null && (typeof updates.logo_url !== 'string' || !updates.logo_url.trim())) {
      return res.status(400).json({ error: 'logo_url debe ser una URL válida o null.' });
    }
    if (updates.logo_url !== null) {
      const { data: clubForLogo } = await supabase
        .from('clubes')
        .select('plan')
        .eq('id', clubId)
        .maybeSingle();
      if (!CLUB_AD_PLANS.has(clubForLogo?.plan)) {
        return res.status(403).json({ error: 'Los planes Pro o Premium son requeridos para subir un logo.' });
      }
    }
  }

  // white_label: requires premium plan
  if (Object.prototype.hasOwnProperty.call(updates, 'white_label') && updates.white_label === true) {
    const { data: club } = await supabase
      .from('clubes')
      .select('plan')
      .eq('id', clubId)
      .maybeSingle();

    if (club?.plan !== WHITE_LABEL_PLAN) {
      return res.status(403).json({ error: 'El plan Premium es requerido para activar Marca Blanca.' });
    }
  }

  const { data, error } = await supabase
    .from('clubes')
    .update(updates)
    .eq('id', clubId)
    .select('id, nombre, slug, logo_url, config_visual, plan, white_label')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
};

// ──────────────────────────────────────────────────────────────────────
// GET /api/club-config/ads  (admin)
// ──────────────────────────────────────────────────────────────────────
const getAds = async (req, res) => {
  const { clubId, error: clubError } = resolveClubId(req);
  if (clubError) return res.status(400).json({ error: clubError });

  const { data, error } = await supabase
    .from('club_ads')
    .select('*')
    .eq('club_id', clubId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
};

// ──────────────────────────────────────────────────────────────────────
// POST /api/club-config/ads  (admin — Pro/Premium only)
// ──────────────────────────────────────────────────────────────────────
const createAd = async (req, res) => {
  const { clubId, error: clubError } = resolveClubId(req);
  if (clubError) return res.status(400).json({ error: clubError });

  const { data: club } = await supabase
    .from('clubes')
    .select('plan')
    .eq('id', clubId)
    .maybeSingle();

  if (!CLUB_AD_PLANS.has(club?.plan)) {
    return res.status(403).json({ error: 'Los planes Pro o Premium son requeridos para gestionar anuncios.' });
  }

  const { image_url, link_url, location = 'banner_bottom', sort_order = 0 } = req.body;

  if (!image_url || typeof image_url !== 'string' || !image_url.trim()) {
    return res.status(400).json({ error: 'image_url es requerido.' });
  }

  if (location && !VALID_LOCATIONS.has(location)) {
    return res.status(400).json({ error: 'Ubicación no válida.' });
  }

  const { data, error } = await supabase
    .from('club_ads')
    .insert({
      club_id: clubId,
      image_url: image_url.trim(),
      link_url: link_url ? String(link_url).trim() : null,
      location,
      sort_order: Number(sort_order) || 0,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
};

// ──────────────────────────────────────────────────────────────────────
// PATCH /api/club-config/ads/:id  (admin)
// ──────────────────────────────────────────────────────────────────────
const updateAd = async (req, res) => {
  const { clubId, error: clubError } = resolveClubId(req);
  const { id } = req.params;
  if (clubError) return res.status(400).json({ error: clubError });

  const updates = {};
  for (const field of ALLOWED_AD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar.' });
  }

  if (updates.location !== undefined && !VALID_LOCATIONS.has(updates.location)) {
    return res.status(400).json({ error: 'Ubicación no válida.' });
  }

  const { data, error } = await supabase
    .from('club_ads')
    .update(updates)
    .eq('id', id)
    .eq('club_id', clubId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Anuncio no encontrado.' });
  return res.json(data);
};

// ──────────────────────────────────────────────────────────────────────
// DELETE /api/club-config/ads/:id  (admin)
// ──────────────────────────────────────────────────────────────────────
const deleteAd = async (req, res) => {
  const { clubId, error: clubError } = resolveClubId(req);
  const { id } = req.params;
  if (clubError) return res.status(400).json({ error: clubError });

  const { error } = await supabase
    .from('club_ads')
    .delete()
    .eq('id', id)
    .eq('club_id', clubId);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).send();
};

// ──────────────────────────────────────────────────────────────────────
// GET /api/club-config/public-ads?club_id=xxx  (public — no auth)
// ──────────────────────────────────────────────────────────────────────
const getPublicAds = async (req, res) => {
  const { club_id } = req.query;
  if (!club_id || typeof club_id !== 'string' || !club_id.trim()) {
    return res.status(400).json({ error: 'club_id es requerido.' });
  }

  const { data, error } = await supabase
    .from('club_ads')
    .select('id, image_url, link_url, location, sort_order')
    .eq('club_id', club_id.trim())
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
};

module.exports = { getConfig, updateConfig, getAds, createAd, updateAd, deleteAd, getPublicAds };
