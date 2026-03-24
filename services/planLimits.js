/**
 * services/planLimits.js
 *
 * Verifica si un club puede crear un nuevo recurso según su plan de suscripción.
 * Consulta plan_limits (lookup) y cuenta los recursos activos del club.
 *
 * Uso:
 *   const { allowed, current, limit, plan } = await checkLimit(clubId, 'cancha');
 */

const supabase = require('./supabase');

const RESOURCE_TABLES = {
  torneo: { table: 'torneos', club_col: 'club_id' },
  cancha: { table: 'canchas', club_col: 'club_id' },
  jugador: { table: 'perfiles', club_col: 'club_id' },
};

/**
 * @param {string} clubId  - UUID del club
 * @param {'torneo'|'cancha'} resourceType
 * @returns {Promise<{ allowed: boolean, current: number, limit: number, plan: string, error?: string }>}
 */
const checkLimit = async (clubId, resourceType) => {
  if (!clubId) {
    return { allowed: false, current: 0, limit: 0, plan: 'basico', error: 'club_id requerido' };
  }

  const resourceMeta = RESOURCE_TABLES[resourceType];
  if (!resourceMeta) {
    return { allowed: false, current: 0, limit: 0, plan: 'basico', error: `Tipo de recurso desconocido: ${resourceType}` };
  }

  // 1. Obtener el plan del club
  const { data: club, error: clubError } = await supabase
    .from('clubes')
    .select('plan')
    .eq('id', clubId)
    .maybeSingle();

  if (clubError || !club) {
    return { allowed: false, current: 0, limit: 0, plan: 'basico', error: 'Club no encontrado' };
  }

  const plan = club.plan || 'basico';

  // 2. Obtener el límite para (plan, resourceType)
  const { data: limitRow, error: limitError } = await supabase
    .from('plan_limits')
    .select('max_count')
    .eq('plan', plan)
    .eq('resource_type', resourceType)
    .maybeSingle();

  if (limitError || !limitRow) {
    // Si no se encuentra fila, permitir (fallo abierto — no bloqueamos por error de config)
    return { allowed: true, current: 0, limit: -1, plan };
  }

  const limit = limitRow.max_count;

  // -1 = ilimitado
  if (limit === -1) {
    return { allowed: true, current: 0, limit: -1, plan };
  }

  // 3. Contar recursos actuales del club
  const { count, error: countError } = await supabase
    .from(resourceMeta.table)
    .select('id', { count: 'exact', head: true })
    .eq(resourceMeta.club_col, clubId);

  if (countError) {
    // Permitir ante error de conteo (fallo abierto)
    return { allowed: true, current: 0, limit, plan };
  }

  const current = count ?? 0;
  const allowed = current < limit;

  return { allowed, current, limit, plan };
};

module.exports = { checkLimit };
