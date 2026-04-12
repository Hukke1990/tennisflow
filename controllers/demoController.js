'use strict';

/**
 * controllers/demoController.js
 *
 * POST /api/super-admin/demo/seed   — Genera datos de demostración completos para un club.
 * DELETE /api/super-admin/demo/reset — Elimina todos los datos marcados como [DEMO] del club.
 *
 * Identificador de demo: todos los registros tienen el prefijo "[DEMO]" en su campo de nombre principal.
 * La eliminación se basa en ese prefijo sin necesidad de migraciones adicionales.
 */

const supabase = require('../services/supabase');
const { handleError } = require('../utils/errors');
const logger = require('../services/logger');

const uuid = () => crypto.randomUUID();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEMO_PREFIX = '[DEMO]';

// ── Datos ficticios ────────────────────────────────────────────────────────────

// 16 nombres masculinos y 16 femeninos — uno por cada slot de bracket dentro de cada categoría
const NOMBRES_MASC = [
  'Santiago Álvarez',   'Mateo Guerrero',    'Benjamín Castro',   'Emiliano Suárez',
  'Sebastián García',   'Tomás Rodríguez',   'Facundo López',     'Agustín Martínez',
  'Lucas Fernández',    'Nicolás González',  'Diego Díaz',        'Iván Moreno',
  'Maximiliano Pérez',  'Rodrigo Torres',    'Federico Ruiz',     'Leandro Vargas',
];

const NOMBRES_FEM = [
  'Valentina Sosa',    'Camila Herrera',    'Luciana Torres',    'Florencia Castro',
  'Sofía Greco',       'Julieta Romero',    'Micaela Morales',   'Agostina Suárez',
  'Constanza Ríos',    'Belén Medina',      'Aldana Vega',       'Catalina Ortega',
  'Renata Blanco',     'Valeria Acosta',    'Natalí Gutiérrez',  'Mónica Sandoval',
];

// ELO por posición dentro de la categoría (índice 0 = mejor seed)
const ELO_SLOT_MASC = [1880,1840,1820,1800,1780,1760,1740,1720,1700,1680,1660,1640,1620,1600,1570,1540];
const ELO_SLOT_FEM  = [1850,1810,1790,1770,1750,1730,1710,1690,1670,1650,1630,1610,1590,1570,1540,1510];
// Reducción de ELO y puntos por categoría (cat 1 = más alto, cat 5 = más bajo)
const ELO_CAT_OFFSET = [0, -200, -400, -600, -800];
const PTS_CAT_OFFSET = [0, -80, -160, -240, -320];

const SCORES_2S = ['6-3 6-2', '6-4 7-5', '6-1 6-3', '7-6 6-4', '6-2 6-1', '6-3 7-6', '7-5 6-3', '6-0 6-3'];
const SCORES_3S = ['7-5 4-6 6-3', '6-4 4-6 7-5', '3-6 6-4 6-2', '6-3 2-6 6-1'];
const sc = (i, sets3 = false) =>
  sets3 && i % 4 === 3 ? SCORES_3S[i % SCORES_3S.length] : SCORES_2S[i % SCORES_2S.length];

/**
 * Crea un bracket de eliminación simple para 16 jugadores (4 rondas, 15 partidos).
 * El mejor seed gana sistemáticamente — es un demo, no un sorteo real.
 * @param {string}   torneoId
 * @param {string[]} ids      - 16 IDs, índice 0 = seed 1
 * @param {string}   canchaId
 * @param {Date}     fechaBase - fecha aproximada del partido final
 * @param {'finalizado'|'en_progreso'} modo
 * @param {string|null} adminId - se inyecta en posición 2 (llega a semis)
 * @returns {object[]}
 */
function buildBracket16(torneoId, ids, canchaId, fechaBase, modo, adminId = null) {
  const partidos = [];
  const jugadores = [...ids];
  if (adminId) jugadores[2] = adminId;

  // Primera Ronda — 8 partidos (ronda_orden = 16)
  const r1w = [];
  for (let i = 0; i < 8; i++) {
    const j1 = jugadores[i * 2];
    const j2 = jugadores[i * 2 + 1];
    const f  = new Date(fechaBase); f.setDate(f.getDate() - 21);
    partidos.push({ id: uuid(), torneo_id: torneoId, ronda: 'Primera Ronda', ronda_orden: 16,
      jugador1_id: j1, jugador2_id: j2, ganador_id: j1,
      estado: 'finalizado', score: sc(i), cancha_id: canchaId, fecha_hora: f.toISOString() });
    r1w.push(j1);
  }

  // Cuartos de Final — 4 partidos
  const r2w = [];
  for (let i = 0; i < 4; i++) {
    const j1 = r1w[i * 2];
    const j2 = r1w[i * 2 + 1];
    const f  = new Date(fechaBase); f.setDate(f.getDate() - 14);
    partidos.push({ id: uuid(), torneo_id: torneoId, ronda: 'Cuartos de Final', ronda_orden: 8,
      jugador1_id: j1, jugador2_id: j2, ganador_id: j1,
      estado: 'finalizado', score: sc(i + 8), cancha_id: canchaId, fecha_hora: f.toISOString() });
    r2w.push(j1);
  }

  // Semifinal — 2 partidos
  const r3w = [];
  for (let i = 0; i < 2; i++) {
    const j1    = r2w[i * 2];
    const j2    = r2w[i * 2 + 1];
    const isDone = modo === 'finalizado';
    const f     = new Date(fechaBase); f.setDate(f.getDate() - 7);
    partidos.push({ id: uuid(), torneo_id: torneoId, ronda: 'Semifinal', ronda_orden: 4,
      jugador1_id: j1, jugador2_id: j2, ganador_id: isDone ? j1 : null,
      estado: isDone ? 'finalizado' : 'programado',
      score: isDone ? sc(i + 12, true) : null,
      cancha_id: canchaId, fecha_hora: f.toISOString() });
    if (isDone) r3w.push(j1);
  }

  // Final — 1 partido
  if (modo === 'finalizado') {
    partidos.push({ id: uuid(), torneo_id: torneoId, ronda: 'Final', ronda_orden: 2,
      jugador1_id: r3w[0], jugador2_id: r3w[1], ganador_id: r3w[0],
      estado: 'finalizado', score: '7-5 6-4',
      cancha_id: canchaId, fecha_hora: fechaBase.toISOString() });
  }

  return partidos;
}

/**
 * Crea un bracket de dobles para 8 parejas (16 jugadores agrupados de a 2).
 * @param {string}   torneoId
 * @param {string[]} ids      - 16 IDs, pareja i = [ids[i*2], ids[i*2+1]]
 * @param {string}   canchaId
 * @param {Date}     fechaBase
 * @param {'finalizado'|'en_progreso'} modo
 * @returns {object[]}
 */
function buildBracketDobles8(torneoId, ids, canchaId, fechaBase, modo) {
  const partidos = [];
  const primero  = (i) => ids[i * 2];

  // Cuartos — 4 partidos entre 8 parejas
  const qw = [];
  for (let i = 0; i < 4; i++) {
    const j1 = primero(i * 2);
    const j2 = primero(i * 2 + 1);
    const f  = new Date(fechaBase); f.setDate(f.getDate() - 14);
    partidos.push({ id: uuid(), torneo_id: torneoId, ronda: 'Cuartos de Final', ronda_orden: 8,
      jugador1_id: j1, jugador2_id: j2, ganador_id: j1,
      estado: 'finalizado', score: sc(i + 4), cancha_id: canchaId, fecha_hora: f.toISOString() });
    qw.push(j1);
  }

  // Semis — 2 partidos
  const sw = [];
  for (let i = 0; i < 2; i++) {
    const j1    = qw[i * 2];
    const j2    = qw[i * 2 + 1];
    const isDone = modo === 'finalizado';
    const f     = new Date(fechaBase); f.setDate(f.getDate() - 7);
    partidos.push({ id: uuid(), torneo_id: torneoId, ronda: 'Semifinal', ronda_orden: 4,
      jugador1_id: j1, jugador2_id: j2, ganador_id: isDone ? j1 : null,
      estado: isDone ? 'finalizado' : 'programado',
      score: isDone ? sc(i + 2, true) : null,
      cancha_id: canchaId, fecha_hora: f.toISOString() });
    if (isDone) sw.push(j1);
  }

  // Final
  if (modo === 'finalizado') {
    partidos.push({ id: uuid(), torneo_id: torneoId, ronda: 'Final', ronda_orden: 2,
      jugador1_id: sw[0], jugador2_id: sw[1], ganador_id: sw[0],
      estado: 'finalizado', score: '7-5 4-6 7-5',
      cancha_id: canchaId, fecha_hora: fechaBase.toISOString() });
  }

  return partidos;
}

// ── POST /api/super-admin/demo/seed ───────────────────────────────────────────

const seedDemo = async (req, res) => {
  try {
    const rawClubId = req.query?.club_id ?? req.body?.club_id;
    const clubId = String(rawClubId || '').trim();

    if (!clubId || !UUID_REGEX.test(clubId)) {
      return res.status(400).json({ error: 'club_id es obligatorio y debe ser un UUID válido.' });
    }

    // ── 1. Verificar que el club existe ───────────────────────────────────────
    const { data: club, error: clubError } = await supabase
      .from('clubes')
      .select('id, nombre')
      .eq('id', clubId)
      .maybeSingle();

    if (clubError || !club) {
      return res.status(404).json({ error: 'Club no encontrado.' });
    }

    // Verificar que no haya datos demo ya existentes
    const { count: existingCount } = await supabase
      .from('perfiles')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .like('nombre_completo', `${DEMO_PREFIX}%`);

    if (existingCount > 0) {
      return res.status(409).json({
        error: 'Ya existen datos de demo para este club. Usá el botón "Eliminar demo" para limpiarlos primero.',
      });
    }

    const ahora = new Date();
    const d = (days) => { const r = new Date(ahora); r.setDate(r.getDate() + days); return r; };

    // ── 0b. Buscar el admin del club (para poblar Mi Perfil y Mi Actividad) ─────
    const { data: adminsEnClub } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, rol')
      .eq('club_id', clubId)
      .in('rol', ['admin', 'super_admin'])
      .limit(1);
    const adminPerfil = adminsEnClub?.[0] ?? null;

    // ── 2. Crear canchas demo ─────────────────────────────────────────────────
    const SUPERFICIES_DEMO = [
      { nombre: 'Cancha 1 — Central (Polvo de ladrillo)',  superficie: 'Polvo de ladrillo' },
      { nombre: 'Cancha 2 — Sintética',                    superficie: 'Sintética' },
      { nombre: 'Cancha 3 — Cemento Exterior',             superficie: 'Cemento' },
      { nombre: 'Cancha 4 — Rápida Indoor',                superficie: 'Rápida' },
      { nombre: 'Cancha 5 — Polvo de ladrillo Cubierta',  superficie: 'Polvo de ladrillo' },
      { nombre: 'Cancha 6 — Entrenamiento (Cemento)',      superficie: 'Cemento' },
    ];
    const canchasData = SUPERFICIES_DEMO.map((s, i) => ({
      id: uuid(),
      nombre: `${DEMO_PREFIX} ${s.nombre}`,
      tipo_superficie: s.superficie,
      esta_disponible: i !== 3,
      club_id: clubId,
    }));

    const { data: canchasInsertadas, error: canchasError } = await supabase
      .from('canchas')
      .insert(canchasData)
      .select('id');

    if (canchasError) throw new Error(`canchas: ${canchasError.message}`);
    const canchaIds = canchasInsertadas.map((c) => c.id);

    // ── 3. Crear perfiles demo — 16 masc + 16 fem × 5 categorías = 160 jugadores ──
    const todosPerfles = [];
    // idsByCatSex[cat][sexo] = array de 16 IDs
    const idsByCatSex = {};

    for (let cat = 1; cat <= 5; cat++) {
      idsByCatSex[cat] = { Masculino: [], Femenino: [] };
      const eloOff = ELO_CAT_OFFSET[cat - 1];
      const ptsOff = PTS_CAT_OFFSET[cat - 1];

      NOMBRES_MASC.forEach((base, i) => {
        const id = uuid();
        idsByCatSex[cat].Masculino.push(id);
        todosPerfles.push({
          id,
          nombre_completo: `${DEMO_PREFIX} ${base} C${cat}`,
          club_id: clubId,
          rol: 'jugador',
          sexo: 'Masculino',
          categoria: cat,
          categoria_singles: cat,
          categoria_dobles:  cat,
          ranking_elo_singles: ELO_SLOT_MASC[i] + eloOff,
          ranking_elo_dobles:  Math.round((ELO_SLOT_MASC[i] + eloOff) * 0.95),
          ranking_puntos:          Math.max(0, (16 - i) * 25 + ptsOff),
          ranking_puntos_singles:  Math.max(0, (16 - i) * 25 + ptsOff),
          ranking_puntos_dobles:   Math.max(0, Math.round(((16 - i) * 20 + ptsOff) * 0.9)),
          localidad: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza'][i % 4],
          mano_dominante: i % 5 === 0 ? 'Zurdo' : 'Diestro',
          estilo_reves: i % 3 === 0 ? '2 manos' : '1 mano',
        });
      });

      NOMBRES_FEM.forEach((base, i) => {
        const id = uuid();
        idsByCatSex[cat].Femenino.push(id);
        todosPerfles.push({
          id,
          nombre_completo: `${DEMO_PREFIX} ${base} C${cat}`,
          club_id: clubId,
          rol: 'jugador',
          sexo: 'Femenino',
          categoria: cat,
          categoria_singles: cat,
          categoria_dobles:  cat,
          ranking_elo_singles: ELO_SLOT_FEM[i] + eloOff,
          ranking_elo_dobles:  Math.round((ELO_SLOT_FEM[i] + eloOff) * 0.95),
          ranking_puntos:          Math.max(0, (16 - i) * 23 + ptsOff),
          ranking_puntos_singles:  Math.max(0, (16 - i) * 23 + ptsOff),
          ranking_puntos_dobles:   Math.max(0, Math.round(((16 - i) * 18 + ptsOff) * 0.9)),
          localidad: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza'][i % 4],
          mano_dominante: i % 7 === 0 ? 'Zurda' : 'Diestra',
          estilo_reves: i % 4 === 0 ? '2 manos' : '1 mano',
        });
      });
    }

    // Insertar en lotes de 50 para evitar límites de payload
    for (let i = 0; i < todosPerfles.length; i += 50) {
      const lote = todosPerfles.slice(i, i + 50);
      const { error: pe } = await supabase.from('perfiles').insert(lote);
      if (pe) throw new Error(`perfiles lote ${i}: ${pe.message}`);
    }

    // ── 4. Torneos — definición y creación ───────────────────────────────────
    const torneosDef = [];

    // Singles Masculino cat 1-5
    for (let cat = 1; cat <= 5; cat++) {
      const off = (cat - 1) * -70;
      torneosDef.push({
        sexo: 'Masculino', modalidad: 'Singles', cat,
        titulo: `${DEMO_PREFIX} Copa Singles Masculino Cat ${cat}`,
        estado: cat <= 3 ? 'finalizado' : cat === 4 ? 'en_progreso' : 'abierto',
        fi: d(off - 45), ff: d(off - 10), fii: d(off - 75), fci: d(off - 50),
        puntos_campeon: [200, 160, 120, 100, 80][cat - 1],
      });
    }

    // Singles Femenino cat 1-5
    for (let cat = 1; cat <= 5; cat++) {
      const off = (cat - 1) * -65 - 5;
      torneosDef.push({
        sexo: 'Femenino', modalidad: 'Singles', cat,
        titulo: `${DEMO_PREFIX} Torneo Singles Femenino Cat ${cat}`,
        estado: cat <= 3 ? 'finalizado' : cat === 4 ? 'en_progreso' : 'abierto',
        fi: d(off - 42), ff: d(off - 8), fii: d(off - 72), fci: d(off - 47),
        puntos_campeon: [200, 160, 120, 100, 80][cat - 1],
      });
    }

    // Dobles Masculino cat 1-2
    for (let cat = 1; cat <= 2; cat++) {
      const off = cat === 1 ? -55 : -20;
      torneosDef.push({
        sexo: 'Masculino', modalidad: 'Dobles', cat,
        titulo: `${DEMO_PREFIX} Gran Premio Dobles Masculino Cat ${cat}`,
        estado: cat === 1 ? 'finalizado' : 'en_progreso',
        fi: d(off - 28), ff: d(off), fii: d(off - 55), fci: d(off - 32),
        puntos_campeon: [180, 140][cat - 1],
      });
    }

    // Dobles Femenino cat 1-2
    for (let cat = 1; cat <= 2; cat++) {
      const off = cat === 1 ? -50 : -15;
      torneosDef.push({
        sexo: 'Femenino', modalidad: 'Dobles', cat,
        titulo: `${DEMO_PREFIX} Gran Premio Dobles Femenino Cat ${cat}`,
        estado: cat === 1 ? 'finalizado' : 'en_progreso',
        fi: d(off - 28), ff: d(off), fii: d(off - 55), fci: d(off - 32),
        puntos_campeon: [180, 140][cat - 1],
      });
    }

    // Torneo abierto futuro (para mostrar inscripciones abiertas)
    torneosDef.push({
      sexo: 'Masculino', modalidad: 'Singles', cat: 1,
      titulo: `${DEMO_PREFIX} Open Anual — Singles Masculino`,
      estado: 'abierto',
      fi: d(30), ff: d(60), fii: d(5), fci: d(25),
      puntos_campeon: 250,
    });

    let totalTorneos = 0, totalInscripciones = 0, totalPartidos = 0;

    for (const def of torneosDef) {
      const torneoId  = uuid();
      const canchaId  = canchaIds[def.cat % canchaIds.length] ?? canchaIds[0];
      const esDobles  = def.modalidad === 'Dobles';
      const esAbierto = def.estado === 'abierto';

      const { error: te } = await supabase.from('torneos').insert([{
        id: torneoId,
        titulo: def.titulo,
        club_id: clubId,
        costo: [3500, 3000, 2500, 2000, 1500][def.cat - 1] ?? 2000,
        rama: def.sexo,
        modalidad: def.modalidad,
        categoria_id: def.cat,
        estado: def.estado,
        fecha_inicio_inscripcion: def.fii.toISOString(),
        fecha_cierre_inscripcion: def.fci.toISOString(),
        fecha_inicio: def.fi.toISOString(),
        fecha_fin:    def.ff.toISOString(),
        puntos_ronda_32: 5,
        puntos_ronda_16: [10, 8, 6, 5, 4][def.cat - 1] ?? 5,
        puntos_ronda_8:  [25, 20, 15, 12, 10][def.cat - 1] ?? 10,
        puntos_ronda_4:  [50, 40, 30, 25, 20][def.cat - 1] ?? 20,
        puntos_ronda_2:  [100, 80, 60, 50, 40][def.cat - 1] ?? 40,
        puntos_campeon: def.puntos_campeon,
      }]);
      if (te) throw new Error(`torneo "${def.titulo}": ${te.message}`);
      totalTorneos++;

      const idsPool   = idsByCatSex[def.cat]?.[def.sexo] ?? idsByCatSex[1].Masculino;
      const idsUsados = esAbierto ? idsPool.slice(0, 6) : idsPool.slice(0, 16);

      // Inyectar al admin en el primer Singles Masculino cat 1 finalizado
      let idsConAdmin = [...idsUsados];
      if (adminPerfil && def.modalidad === 'Singles' && def.sexo === 'Masculino'
          && def.cat === 1 && def.estado === 'finalizado') {
        idsConAdmin[2] = adminPerfil.id;
      }

      // Inscripciones
      const inscRows = idsConAdmin.map((jugadorId) => ({
        id: uuid(),
        torneo_id: torneoId,
        jugador_id: jugadorId,
        club_id: clubId,
        estado: 'confirmada',
        estado_inscripcion: esAbierto ? 'pendiente' : 'aprobada',
        pago_confirmado: !esAbierto,
        fecha_inscripcion: def.fci.toISOString(),
      }));
      const { error: ie } = await supabase.from('inscripciones').insert(inscRows);
      if (ie) throw new Error(`inscripciones "${def.titulo}": ${ie.message}`);
      totalInscripciones += inscRows.length;

      // Brackets
      if (!esAbierto && idsConAdmin.length >= 8) {
        const adminEnTorneo = adminPerfil && idsConAdmin.includes(adminPerfil.id);
        const bracketPartidos = esDobles
          ? buildBracketDobles8(torneoId, idsConAdmin, canchaId, def.ff,
              def.estado === 'finalizado' ? 'finalizado' : 'en_progreso')
          : buildBracket16(torneoId, idsConAdmin, canchaId, def.ff,
              def.estado === 'finalizado' ? 'finalizado' : 'en_progreso',
              adminEnTorneo ? adminPerfil.id : null);

        if (bracketPartidos.length > 0) {
          const { error: pare } = await supabase.from('partidos').insert(bracketPartidos);
          if (pare) throw new Error(`partidos "${def.titulo}": ${pare.message}`);
          totalPartidos += bracketPartidos.length;
        }
      }
    }

    // ── 5. Actualizar perfil del admin (Mi Perfil) ────────────────────────────
    if (adminPerfil) {
      await supabase.from('perfiles').update({
        localidad:           'Buenos Aires',
        mano_dominante:      'Diestro',
        estilo_reves:        '1 mano',
        altura:              178,
        peso:                75,
        categoria:           1,
        categoria_singles:   1,
        categoria_dobles:    1,
        ranking_elo_singles: 1820,
        ranking_elo_dobles:  1730,
        ranking_puntos:          380,
        ranking_puntos_singles:  380,
        ranking_puntos_dobles:   290,
      }).eq('id', adminPerfil.id);
    }

    logger.info('demo_seed_completed', {
      club_id: clubId,
      jugadores: todosPerfles.length,
      canchas:   canchasData.length,
      torneos:   totalTorneos,
      inscripciones: totalInscripciones,
      partidos:  totalPartidos,
      admin_actualizado: !!adminPerfil,
    });

    return res.status(201).json({
      message: `Demo generado con éxito para "${club.nombre}".`,
      resumen: {
        jugadores:     todosPerfles.length,
        canchas:       canchasData.length,
        torneos:       totalTorneos,
        inscripciones: totalInscripciones,
        partidos:      totalPartidos,
        admin_actualizado: !!adminPerfil,
      },
    });
  } catch (err) {
    logger.error('demo_seed_error', { error: err?.message });
    // Los errores lanzados en este controller tienen mensajes descriptivos y seguros.
    return res.status(500).json({ error: err?.message || 'Error interno del servidor' });
  }
};

// ── DELETE /api/super-admin/demo/reset ────────────────────────────────────────

const resetDemo = async (req, res) => {
  try {
    const rawClubId = req.query?.club_id ?? req.body?.club_id;
    const clubId = String(rawClubId || '').trim();

    if (!clubId || !UUID_REGEX.test(clubId)) {
      return res.status(400).json({ error: 'club_id es obligatorio y debe ser un UUID válido.' });
    }

    // Verificar que el club existe
    const { data: club, error: clubError } = await supabase
      .from('clubes')
      .select('id, nombre')
      .eq('id', clubId)
      .maybeSingle();

    if (clubError || !club) {
      return res.status(404).json({ error: 'Club no encontrado.' });
    }

    // 1. Eliminar torneos demo → cascadea partidos, inscripciones, disponibilidad_inscripcion
    const { error: torneosDelError } = await supabase
      .from('torneos')
      .delete()
      .eq('club_id', clubId)
      .like('titulo', `${DEMO_PREFIX}%`);

    if (torneosDelError) throw new Error(`Error al eliminar torneos demo: ${torneosDelError.message}`);

    // 2. Eliminar canchas demo
    const { error: canchasDelError } = await supabase
      .from('canchas')
      .delete()
      .eq('club_id', clubId)
      .like('nombre', `${DEMO_PREFIX}%`);

    if (canchasDelError) throw new Error(`Error al eliminar canchas demo: ${canchasDelError.message}`);

    // 3. Eliminar perfiles demo (último porque partidos/inscripciones ON DELETE SET NULL / CASCADE)
    const { data: perfilesDel, error: perfilesDelError } = await supabase
      .from('perfiles')
      .delete()
      .eq('club_id', clubId)
      .like('nombre_completo', `${DEMO_PREFIX}%`)
      .select('id');

    if (perfilesDelError) throw new Error(`Error al eliminar perfiles demo: ${perfilesDelError.message}`);

    logger.info('demo_reset_completed', {
      club_id: clubId,
      perfiles_eliminados: perfilesDel?.length ?? 0,
    });

    return res.status(200).json({
      message: `Datos de demo eliminados correctamente de "${club.nombre}".`,
      perfiles_eliminados: perfilesDel?.length ?? 0,
    });
  } catch (err) {
    logger.error('demo_reset_error', { error: err?.message });
    return handleError(res, err, logger);
  }
};

module.exports = { seedDemo, resetDemo };
