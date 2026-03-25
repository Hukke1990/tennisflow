const supabase = require('../services/supabase');

const ALLOWED_PLANS = new Set(['basico', 'pro', 'premium', 'test']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEMP_PASSWORD_MIN_LENGTH = 8;
const PASSWORD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_LOWER = 'abcdefghijkmnopqrstuvwxyz';
const PASSWORD_DIGITS = '23456789';
const PASSWORD_SYMBOLS = '!@#$%*+-_';
const PASSWORD_ALL = `${PASSWORD_UPPER}${PASSWORD_LOWER}${PASSWORD_DIGITS}${PASSWORD_SYMBOLS}`;

const normalizePlan = (value) => String(value || '').trim().toLowerCase();

const normalizeSlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const pickErrorCode = (error) => String(error?.code || '').trim();

const isMissingPlanColumnError = (error) => {
  const code = pickErrorCode(error);
  const message = String(error?.message || '').toLowerCase();
  return code === '42703' && message.includes('plan');
};

const isIsActiveColumnError = (error) => {
  const code = pickErrorCode(error);
  const message = String(error?.message || '').toLowerCase();
  return code === '42703' && message.includes('is_active');
};

const mapCreateUserErrorMessage = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status || 0);

  if (
    status === 401
    || status === 403
    || message.includes('not allowed')
    || message.includes('insufficient')
    || message.includes('invalid api key')
    || message.includes('permission')
  ) {
    return 'El backend no tiene permisos para crear usuarios admin en Supabase. Configura SUPABASE_KEY con service_role y reinicia el servidor.';
  }

  return 'No se pudo crear la cuenta del admin del club.';
};

const pickRandomChar = (alphabet) => {
  const chars = String(alphabet || '');
  if (!chars) return '';

  const index = Math.floor(Math.random() * chars.length);
  return chars[index];
};

const shuffleString = (value) => {
  const chars = String(value || '').split('');

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join('');
};

const generateTemporaryPassword = (length = 12) => {
  const targetLength = Math.max(TEMP_PASSWORD_MIN_LENGTH, Number.parseInt(String(length), 10) || 12);

  const fixed = [
    pickRandomChar(PASSWORD_UPPER),
    pickRandomChar(PASSWORD_LOWER),
    pickRandomChar(PASSWORD_DIGITS),
    pickRandomChar(PASSWORD_SYMBOLS),
  ];

  while (fixed.length < targetLength) {
    fixed.push(pickRandomChar(PASSWORD_ALL));
  }

  return shuffleString(fixed.join(''));
};

const normalizeTemporaryPassword = (value) => String(value || '').trim();

const insertClub = async ({ nombre, slug }) => {
  // Intento 1: esquema completo con migration_v39 (is_active)
  const attempt1 = await supabase
    .from('clubes')
    .insert({ nombre, slug, plan: 'basico', is_active: false })
    .select('id, nombre, slug, plan, is_active')
    .single();

  if (!attempt1.error) return attempt1;

  // Backward compat: migration_v39 no aplicada (columna is_active inexistente)
  if (isIsActiveColumnError(attempt1.error)) {
    const attempt2 = await supabase
      .from('clubes')
      .insert({ nombre, slug, plan: 'basico' })
      .select('id, nombre, slug, plan')
      .single();
    if (!attempt2.error) return { data: { ...attempt2.data, is_active: false }, error: null };
    if (!isMissingPlanColumnError(attempt2.error)) return attempt2;
    // plan también inexistente
    const attempt3 = await supabase
      .from('clubes')
      .insert({ nombre, slug })
      .select('id, nombre, slug')
      .single();
    if (attempt3.error) return attempt3;
    return { data: { ...attempt3.data, plan: 'basico', is_active: false }, error: null };
  }

  // Backward compat: migration_v27 no aplicada (columna plan inexistente)
  if (isMissingPlanColumnError(attempt1.error)) {
    const attempt2 = await supabase
      .from('clubes')
      .insert({ nombre, slug })
      .select('id, nombre, slug')
      .single();
    if (attempt2.error) return attempt2;
    return { data: { ...attempt2.data, plan: 'basico', is_active: false }, error: null };
  }

  return attempt1;
};

const markProfileAsAdmin = async ({ userId, clubId }) => {
  const payloadCandidates = [
    { club_id: clubId, rol: 'admin', es_admin: true },
    { club_id: clubId, rol: 'admin' },
    { club_id: clubId, es_admin: true },
    { club_id: clubId },
  ];

  let lastError = null;
  for (const payload of payloadCandidates) {
    const { error } = await supabase
      .from('perfiles')
      .update(payload)
      .eq('id', userId);

    if (!error) {
      return null;
    }

    lastError = error;
  }

  return lastError;
};

const bestEffortDeleteClub = async (clubId) => {
  if (!clubId) return;

  await supabase
    .from('clubes')
    .delete()
    .eq('id', clubId);
};

const bestEffortDeleteAuthUser = async (userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return;

  await supabase.auth.admin.deleteUser(normalizedUserId);
};

const crearClubConAdmin = async (req, res) => {
  try {
    const nombreClub = String(req.body?.nombreClub || '').trim();
    const slugRaw = String(req.body?.slug || '').trim();
    const adminEmail = String(req.body?.adminEmail || '').trim().toLowerCase();
    const temporaryPasswordInput = normalizeTemporaryPassword(req.body?.temporaryPassword);

    if (nombreClub.length < 3) {
      return res.status(400).json({ error: 'El nombre del club debe tener al menos 3 caracteres.' });
    }

    const slug = normalizeSlug(slugRaw);
    if (!slug || !SLUG_REGEX.test(slug)) {
      return res.status(400).json({ error: 'El slug debe usar solo letras minusculas, numeros y guiones.' });
    }

    if (!EMAIL_REGEX.test(adminEmail)) {
      return res.status(400).json({ error: 'Ingresa un email de administrador valido.' });
    }

    const temporaryPassword = temporaryPasswordInput || generateTemporaryPassword(12);
    if (temporaryPassword.length < TEMP_PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        error: `La password temporal debe tener al menos ${TEMP_PASSWORD_MIN_LENGTH} caracteres.`,
      });
    }

    const { data: club, error: insertClubError } = await insertClub({
      nombre: nombreClub,
      slug,
    });

    if (insertClubError) {
      const code = pickErrorCode(insertClubError);
      if (code === '23505') {
        return res.status(409).json({ error: 'Ese slug ya existe. Prueba otro.' });
      }

      return res.status(500).json({
        error: 'No se pudo crear el club.',
        detail: insertClubError.message,
      });
    }

    const createUserResult = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        rol: 'admin',
        club_id: club.id,
        club_slug: club.slug,
        nombre_completo: `Admin ${nombreClub}`,
      },
      app_metadata: {
        role: 'admin',
      },
    });

    if (createUserResult.error) {
      await bestEffortDeleteClub(club.id);

      const createUserMessage = String(createUserResult.error?.message || '').toLowerCase();
      if (createUserMessage.includes('already registered') || createUserMessage.includes('already been registered')) {
        return res.status(409).json({
          error: 'El email del admin ya esta registrado. Usa otro email o gestiona ese usuario existente.',
        });
      }

      return res.status(500).json({
        error: mapCreateUserErrorMessage(createUserResult.error),
        detail: createUserResult.error.message,
      });
    }

    const adminUserId = createUserResult.data?.user?.id || null;
    if (!adminUserId) {
      await bestEffortDeleteClub(club.id);
      return res.status(500).json({ error: 'No se pudo recuperar el usuario admin creado.' });
    }

    const markProfileError = await markProfileAsAdmin({ userId: adminUserId, clubId: club.id });
    if (markProfileError) {
      await bestEffortDeleteAuthUser(adminUserId);
      await bestEffortDeleteClub(club.id);
      return res.status(500).json({
        error: 'No se pudo terminar de preparar el perfil del admin.',
        detail: markProfileError.message,
      });
    }

    const appUrl = (process.env.APP_URL || 'https://setgo-app.vercel.app').trim();
    return res.status(201).json({
      message: 'Club creado. Enviá el link de activación al cliente para que elija su plan y complete el pago.',
      club: {
        id:        club.id,
        nombre:    club.nombre,
        slug:      club.slug,
        plan:      club.plan ?? 'basico',
        is_active: false,
      },
      admin: {
        email:                adminEmail,
        temporary_password:   temporaryPassword,
        must_change_password: true,
      },
      access: {
        activation_link: `${appUrl}/activar/${club.id}`,
        login_url:       `/${club.slug}/login`,
        app_url:         `/${club.slug}/inicio`,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error interno al crear el club.' });
  }
};

// ── Gestión de Torneos ────────────────────────────────────────────────────────

// Devuelve el club_id a usar: para admin siempre el de su perfil; para
// super_admin acepta el query param (para filtros opcionales).
const resolveClubId = (req) => {
  const rol = String(req.authUser?.rol || '').toLowerCase();
  if (rol === 'admin') return req.authUser?.club_id || null;
  return req.query?.club_id || null;
};

const listarTorneos = async (req, res) => {
  const clubId = resolveClubId(req);
  try {
    let query = supabase
      .from('torneos')
      .select('id, titulo, fecha_inicio, fecha_fin, categoria_id, rama, modalidad, estado, club_id, costo, puntos_ronda_32, puntos_ronda_16, puntos_ronda_8, puntos_ronda_4, puntos_ronda_2, puntos_campeon')
      .order('fecha_inicio', { ascending: false });

    if (clubId) query = query.eq('club_id', clubId);
    query = query.neq('estado', 'cancelado');

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (_) {
    return res.status(500).json({ error: 'Error al listar torneos.' });
  }
};

const editarTorneo = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'ID de torneo requerido.' });

  // Un admin solo puede editar torneos de su propio club.
  const clubId = resolveClubId(req);
  if (clubId) {
    const { data: existing, error: checkErr } = await supabase
      .from('torneos').select('club_id').eq('id', id).single();
    if (checkErr || !existing) return res.status(404).json({ error: 'Torneo no encontrado.' });
    if (String(existing.club_id) !== String(clubId)) {
      return res.status(403).json({ error: 'No tienes permiso para editar este torneo.' });
    }
  }

  const ALLOWED_FIELDS = [
    'titulo', 'fecha_inicio', 'fecha_fin', 'categoria_id', 'rama',
    'modalidad', 'estado', 'costo', 'descripcion', 'max_inscriptos',
    'puntos_ronda_32', 'puntos_ronda_16', 'puntos_ronda_8',
    'puntos_ronda_4', 'puntos_ronda_2', 'puntos_campeon',
  ];

  const updates = {};
  for (const field of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No se enviaron campos a actualizar.' });
  }

  try {
    const { data, error } = await supabase
      .from('torneos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  } catch (_) {
    return res.status(500).json({ error: 'Error al editar torneo.' });
  }
};

const softDeleteTorneo = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'ID de torneo requerido.' });

  // Un admin solo puede cancelar torneos de su propio club.
  const clubId = resolveClubId(req);
  if (clubId) {
    const { data: existing, error: checkErr } = await supabase
      .from('torneos').select('club_id').eq('id', id).single();
    if (checkErr || !existing) return res.status(404).json({ error: 'Torneo no encontrado.' });
    if (String(existing.club_id) !== String(clubId)) {
      return res.status(403).json({ error: 'No tienes permiso para cancelar este torneo.' });
    }
  }

  try {
    const { error } = await supabase
      .from('torneos')
      .update({ estado: 'cancelado' })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, message: 'Torneo marcado como cancelado.' });
  } catch (_) {
    return res.status(500).json({ error: 'Error al desactivar torneo.' });
  }
};

// ── Gestión de Jugadores ──────────────────────────────────────────────────────

const listarJugadores = async (req, res) => {
  const { q } = req.query;
  const clubId = resolveClubId(req);
  try {
    let query = supabase
      .from('perfiles')
      .select('id, nombre_completo, telefono, rol, ranking_puntos, ranking_elo_singles, categoria_singles, categoria_dobles, club_id')
      .order('nombre_completo', { ascending: true });

    if (clubId) query = query.eq('club_id', clubId);
    if (q) query = query.ilike('nombre_completo', `%${q}%`);
    query = query.neq('rol', 'super_admin');

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (_) {
    return res.status(500).json({ error: 'Error al listar jugadores.' });
  }
};

const editarJugador = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'ID de jugador requerido.' });

  // Un admin solo puede editar jugadores de su propio club.
  const clubId = resolveClubId(req);
  if (clubId) {
    const { data: existing, error: checkErr } = await supabase
      .from('perfiles').select('club_id').eq('id', id).single();
    if (checkErr || !existing) return res.status(404).json({ error: 'Jugador no encontrado.' });
    if (String(existing.club_id) !== String(clubId)) {
      return res.status(403).json({ error: 'No tienes permiso para editar este jugador.' });
    }
  }

  const ALLOWED_FIELDS = [
    'nombre_completo', 'telefono',
    'ranking_puntos', 'ranking_elo_singles',
    'categoria_singles', 'categoria_dobles',
  ];

  const updates = {};
  for (const field of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No se enviaron campos a actualizar.' });
  }

  try {
    const { data, error } = await supabase
      .from('perfiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  } catch (_) {
    return res.status(500).json({ error: 'Error al editar jugador.' });
  }
};

// ── Gestión de Rankings ───────────────────────────────────────────────────────

const listarRankings = async (req, res) => {
  const { sexo } = req.query;
  const clubId = resolveClubId(req);
  try {
    let query = supabase
      .from('perfiles')
      .select('id, nombre_completo, ranking_puntos, ranking_elo_singles, club_id')
      .order('ranking_elo_singles', { ascending: false });

    if (clubId) query = query.eq('club_id', clubId);
    if (sexo) query = query.eq('sexo', sexo);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (_) {
    return res.status(500).json({ error: 'Error al listar rankings.' });
  }
};

const ajustarPuntos = async (req, res) => {
  const { id } = req.params;
  const { delta, campo = 'ranking_elo_singles' } = req.body;
  if (!id) return res.status(400).json({ error: 'ID de jugador requerido.' });

  const ALLOWED_CAMPOS = ['ranking_puntos', 'ranking_elo_singles'];
  if (!ALLOWED_CAMPOS.includes(campo)) {
    return res.status(400).json({ error: 'Campo no permitido.' });
  }

  const parsed = Number(delta);
  if (!Number.isFinite(parsed)) {
    return res.status(400).json({ error: 'Delta debe ser un número.' });
  }

  try {
    const { data: current, error: fetchErr } = await supabase
      .from('perfiles')
      .select(`${campo}, club_id`)
      .eq('id', id)
      .single();

    if (fetchErr) return res.status(404).json({ error: 'Jugador no encontrado.' });

    // Un admin solo puede ajustar puntos de jugadores de su propio club.
    const clubId = resolveClubId(req);
    if (clubId && String(current?.club_id) !== String(clubId)) {
      return res.status(403).json({ error: 'No tienes permiso para ajustar puntos de este jugador.' });
    }

    const currentVal = Number(current?.[campo] || 0);
    const newVal = Math.max(0, currentVal + parsed);

    const { data, error } = await supabase
      .from('perfiles')
      .update({ [campo]: newVal })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  } catch (_) {
    return res.status(500).json({ error: 'Error al ajustar puntos.' });
  }
};

const resetearPuntos = async (req, res) => {
  // Para admin, forzar su propio club; para super_admin, aceptar el body.
  const clubId = resolveClubId(req) || req.body?.club_id;
  const { campo = 'ranking_elo_singles' } = req.body;
  if (!clubId) return res.status(400).json({ error: 'club_id requerido.' });
  const club_id = clubId;

  const ALLOWED_CAMPOS = ['ranking_puntos', 'ranking_elo_singles'];
  if (!ALLOWED_CAMPOS.includes(campo)) {
    return res.status(400).json({ error: 'Campo no permitido.' });
  }

  try {
    const { error } = await supabase
      .from('perfiles')
      .update({ [campo]: 0 })
      .eq('club_id', club_id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, message: `${campo} reseteado a 0 para todos los jugadores del club.` });
  } catch (_) {
    return res.status(500).json({ error: 'Error al resetear puntos.' });
  }
};

const listarClubes = async (_req, res) => {
  try {
    const APP_URL = (process.env.APP_URL || 'https://setgo-app.vercel.app').trim();

    const { data: clubesData, error: clubesError } = await supabase
      .from('clubes')
      .select('id, nombre, slug, plan, is_active')
      .order('nombre', { ascending: true });

    if (clubesError) return res.status(500).json({ error: 'Error al listar clubes.', detail: clubesError.message });

    const clubIds = (clubesData || []).map((c) => c.id);

    let subsMap = {};
    if (clubIds.length > 0) {
      const { data: subsData } = await supabase
        .from('suscripciones')
        .select('club_id, plan_id, status, preapproval_id, next_payment_date, updated_at')
        .in('club_id', clubIds);

      for (const sub of (subsData || [])) {
        subsMap[sub.club_id] = sub;
      }
    }

    return res.json(
      (clubesData || []).map((club) => {
        const sub = subsMap[club.id] ?? null;
        return {
          id:              club.id,
          nombre:          club.nombre,
          slug:            club.slug,
          plan:            club.plan,
          is_active:       club.is_active,
          suscripcion:     sub,
          activation_link: club.is_active === false
            ? `${APP_URL}/activar/${club.id}`
            : null,
        };
      }),
    );
  } catch (_) {
    return res.status(500).json({ error: 'Error interno al listar clubes.' });
  }
};

const concederAccesoGratuito = async (req, res) => {
  try {
    const clubId = String(req.params?.id || '').trim();
    const plan   = normalizePlan(req.body?.plan);

    if (!clubId) return res.status(400).json({ error: 'Club ID requerido.' });
    if (!ALLOWED_PLANS.has(plan)) {
      return res.status(400).json({ error: `Plan inválido. Valores aceptados: ${[...ALLOWED_PLANS].join(', ')}.` });
    }

    const { data: club, error: fetchError } = await supabase
      .from('clubes')
      .select('id, nombre, slug')
      .eq('id', clubId)
      .maybeSingle();

    if (fetchError || !club) return res.status(404).json({ error: 'Club no encontrado.' });

    const { error: updateError } = await supabase
      .from('clubes')
      .update({ is_active: true, plan })
      .eq('id', clubId);

    if (updateError) return res.status(500).json({ error: 'Error al actualizar el club.' });

    // Upsert suscripción gratuita / manual
    await supabase.from('suscripciones').upsert(
      {
        club_id:        clubId,
        plan_id:        plan,
        preapproval_id: null,
        status:         'authorized',
        external_reference: clubId,
      },
      { onConflict: 'club_id' },
    );

    return res.json({
      message: `Acceso gratuito al plan "${plan}" concedido correctamente al club "${club.nombre}".`,
      club:    { id: club.id, nombre: club.nombre, slug: club.slug, plan, is_active: true },
    });
  } catch (_) {
    return res.status(500).json({ error: 'Error interno al conceder acceso.' });
  }
};

const restringirAcceso = async (req, res) => {
  try {
    const clubId = String(req.params?.id || '').trim();
    if (!clubId) return res.status(400).json({ error: 'Club ID requerido.' });

    const { data: club, error: fetchError } = await supabase
      .from('clubes')
      .select('id, nombre, slug')
      .eq('id', clubId)
      .maybeSingle();

    if (fetchError || !club) return res.status(404).json({ error: 'Club no encontrado.' });

    const { error: updateError } = await supabase
      .from('clubes')
      .update({ is_active: false })
      .eq('id', clubId);

    if (updateError) return res.status(500).json({ error: 'Error al restringir el club.' });

    // Marcar suscripción como cancelled si existe
    await supabase
      .from('suscripciones')
      .update({ status: 'cancelled' })
      .eq('club_id', clubId);

    return res.json({
      message: `Acceso al club "${club.nombre}" restringido correctamente.`,
      club:    { id: club.id, nombre: club.nombre, slug: club.slug, is_active: false },
    });
  } catch (_) {
    return res.status(500).json({ error: 'Error interno al restringir acceso.' });
  }
};

const activarClubManualmente = async (req, res) => {
  try {
    const clubId = String(req.params?.id || '').trim();
    if (!clubId) return res.status(400).json({ error: 'Club ID requerido.' });

    const { data: club, error: fetchError } = await supabase
      .from('clubes')
      .select('id, nombre, slug, is_active, plan')
      .eq('id', clubId)
      .maybeSingle();

    if (fetchError || !club) return res.status(404).json({ error: 'Club no encontrado.' });

    const { error: updateError } = await supabase
      .from('clubes')
      .update({ is_active: true })
      .eq('id', clubId);

    if (updateError) return res.status(500).json({ error: 'Error al activar el club.' });

    // Marcar suscripción como authorized si existe
    await supabase
      .from('suscripciones')
      .update({ status: 'authorized' })
      .eq('club_id', clubId);

    return res.json({ message: `Club "${club.nombre}" activado correctamente.`, club: { ...club, is_active: true } });
  } catch (_) {
    return res.status(500).json({ error: 'Error interno al activar el club.' });
  }
};

module.exports = {
  crearClubConAdmin,
  listarClubes,
  activarClubManualmente,
  concederAccesoGratuito,
  restringirAcceso,
  listarTorneos,
  editarTorneo,
  softDeleteTorneo,
  listarJugadores,
  editarJugador,
  listarRankings,
  ajustarPuntos,
  resetearPuntos,
};
