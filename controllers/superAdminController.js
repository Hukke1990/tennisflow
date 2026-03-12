const supabase = require('../services/supabase');

const ALLOWED_PLANS = new Set(['basico', 'pro', 'premium']);
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

const insertClub = async ({ nombre, slug, plan }) => {
  const payload = {
    nombre,
    slug,
    plan,
  };

  const withPlan = await supabase
    .from('clubes')
    .insert(payload)
    .select('id, nombre, slug, plan')
    .single();

  if (!withPlan.error) {
    return withPlan;
  }

  // Backward compatibility for environments where migration_v27 was not applied yet.
  if (!isMissingPlanColumnError(withPlan.error)) {
    return withPlan;
  }

  const fallback = await supabase
    .from('clubes')
    .insert({ nombre, slug })
    .select('id, nombre, slug')
    .single();

  if (fallback.error) {
    return fallback;
  }

  return {
    data: {
      ...fallback.data,
      plan,
    },
    error: null,
  };
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
    const plan = normalizePlan(req.body?.plan);
    const adminEmail = String(req.body?.adminEmail || '').trim().toLowerCase();
    const temporaryPasswordInput = normalizeTemporaryPassword(req.body?.temporaryPassword);

    if (nombreClub.length < 3) {
      return res.status(400).json({ error: 'El nombre del club debe tener al menos 3 caracteres.' });
    }

    const slug = normalizeSlug(slugRaw);
    if (!slug || !SLUG_REGEX.test(slug)) {
      return res.status(400).json({ error: 'El slug debe usar solo letras minusculas, numeros y guiones.' });
    }

    if (!ALLOWED_PLANS.has(plan)) {
      return res.status(400).json({ error: 'El plan debe ser basico, pro o premium.' });
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
      plan,
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

    return res.status(201).json({
      message: 'Club creado correctamente y admin creado con password temporal.',
      club: {
        id: club.id,
        nombre: club.nombre,
        slug: club.slug,
        plan,
      },
      admin: {
        email: adminEmail,
        temporary_password: temporaryPassword,
        must_change_password: true,
      },
      access: {
        login_url: `/${club.slug}/login`,
        app_url: `/${club.slug}/inicio`,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error interno al crear el club.' });
  }
};

module.exports = {
  crearClubConAdmin,
};
