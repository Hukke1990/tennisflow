const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const supabase = require('../services/supabase');
const {
  obtenerCuadroTorneo,
  generarSorteo,
  recalcularCronograma,
  publicarCronograma,
  __private,
} = require('../controllers/sorteoController');

const originalFrom = supabase.from;

function createReq({ params = {}, body = {} } = {}) {
  return { params, body };
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
  };
}

function mockSupabaseWithQueue(queue, calls) {
  supabase.from = (table) => {
    const state = {
      table,
      action: null,
      payload: null,
      filters: [],
      inFilters: [],
      selectArgs: null,
      order: [],
      single: false,
    };

    let executed = false;

    const execute = () => {
      if (executed) {
        throw new Error(`La query para ${table} ya se ejecuto una vez.`);
      }
      executed = true;
      calls.push(JSON.parse(JSON.stringify(state)));

      if (queue.length === 0) {
        throw new Error(`No hay respuestas mock disponibles para la tabla ${table}.`);
      }

      return queue.shift();
    };

    return {
      select(columns, options) {
        if (!state.action) {
          state.action = 'select';
        }
        state.selectArgs = { columns, options };
        return this;
      },
      insert(payload) {
        state.action = 'insert';
        state.payload = payload;
        return this;
      },
      update(payload) {
        state.action = 'update';
        state.payload = payload;
        return this;
      },
      eq(column, value) {
        state.filters.push({ op: 'eq', column, value });
        return this;
      },
      in(column, values) {
        state.inFilters.push({ column, values });
        return this;
      },
      order(column, options) {
        state.order.push({ column, options });
        return this;
      },
      or(expression) {
        state.filters.push({ op: 'or', expression });
        return this;
      },
      single() {
        state.single = true;
        return Promise.resolve(execute());
      },
      then(resolve, reject) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };
  };

  return () => {
    assert.equal(queue.length, 0, `Quedaron ${queue.length} respuestas mock sin consumir.`);
  };
}

afterEach(() => {
  supabase.from = originalFrom;
});

test('torneo existente con cuadro -> 200 + array con partidos', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    {
      data: [
        {
          id: 'partido_1',
          ronda: 'Final',
          ronda_orden: 2,
          fecha_hora: '2026-03-07T12:00:00Z',
          notas: null,
          ganador_id: 'j1',
          jugador1_id: 'j1',
          jugador2_id: 'j2',
          cancha_id: 'c1',
        },
      ],
      error: null,
    },
    {
      data: [
        { id: 'j1', nombre_completo: 'Jugador 1', ranking_elo: 1600 },
        { id: 'j2', nombre_completo: 'Jugador 2', ranking_elo: 1550 },
      ],
      error: null,
    },
    {
      data: [{ id: 'c1', nombre: 'Cancha Central' }],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload.length, 1);
  assert.equal(res.payload[0].id, 'partido_1');
  assert.equal(res.payload[0].cancha.nombre, 'Cancha Central');
  assert.equal(res.payload[0].jugador1.nombre_completo, 'Jugador 1');
  assert.equal(res.payload[0].jugador2.nombre_completo, 'Jugador 2');

  assertQueueEmpty();
});

test('torneo existente sin cuadro -> 200 []', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    { data: [], error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, []);

  assertQueueEmpty();
});

test('torneo inexistente -> 404', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: null, error: { code: 'PGRST116', message: 'Not found' } },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 404);
  assert.match(res.payload.error, /Torneo no encontrado/i);

  assertQueueEmpty();
});

test('torneo con datos incompletos (BYE o sin cancha) -> 200 sin romper', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    {
      data: [
        {
          id: 'partido_2',
          ronda: 'Semifinal',
          ronda_orden: 4,
          fecha_hora: null,
          notas: 'Avanza por BYE',
          ganador_id: 'j3',
          jugador1_id: 'j3',
          jugador2_id: null,
          cancha_id: null,
        },
      ],
      error: null,
    },
    {
      data: [
        { id: 'j3', nombre_completo: 'Jugador 3', ranking_elo_singles: 1520 },
      ],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload.length, 1);
  assert.equal(res.payload[0].cancha, null);
  assert.equal(res.payload[0].jugador2, null);
  assert.equal(res.payload[0].jugador1.ranking_elo, 1520);

  assertQueueEmpty();
});

test('GET cuadro completa contrato y resuelve clasificados en ronda siguiente', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    {
      data: [
        {
          id: 'qf1',
          torneo_id: torneoId,
          ronda: 'Cuartos de Final',
          ronda_orden: 8,
          orden_en_ronda: 1,
          estado: 'finalizado',
          fecha_hora: '2026-03-07T10:00:00.000Z',
          cancha_id: 'c1',
          marcador_en_vivo: { sets: [{ j1: 6, j2: 4 }] },
          score: '6-4 6-3',
          resultado: { sets: [[6, 4], [6, 3]] },
          ganador_id: 'j1',
          jugador1_id: 'j1',
          jugador2_id: 'j2',
          jugador1_origen_partido_id: null,
          jugador2_origen_partido_id: null,
        },
        {
          id: 'qf2',
          torneo_id: torneoId,
          ronda: 'Cuartos de Final',
          ronda_orden: 8,
          orden_en_ronda: 2,
          estado: 'finalizado',
          fecha_hora: '2026-03-07T12:00:00.000Z',
          cancha_id: 'c1',
          marcador_en_vivo: null,
          score: '7-5 6-2',
          resultado: { sets: [[7, 5], [6, 2]] },
          ganador_id: 'j4',
          jugador1_id: 'j3',
          jugador2_id: 'j4',
          jugador1_origen_partido_id: null,
          jugador2_origen_partido_id: null,
        },
        {
          id: 'sf1',
          torneo_id: torneoId,
          ronda: 'Semifinal',
          ronda_orden: 4,
          orden_en_ronda: 1,
          estado: 'programado',
          fecha_hora: '2026-03-08T10:00:00.000Z',
          cancha_id: 'c1',
          marcador_en_vivo: null,
          score: null,
          resultado: null,
          ganador_id: null,
          jugador1_id: null,
          jugador2_id: null,
          jugador1_origen_partido_id: null,
          jugador2_origen_partido_id: null,
        },
      ],
      error: null,
    },
    {
      data: [
        { id: 'j1', nombre_completo: 'Jugador 1', ranking_elo: 1600 },
        { id: 'j2', nombre_completo: 'Jugador 2', ranking_elo: 1500 },
        { id: 'j3', nombre_completo: 'Jugador 3', ranking_elo: 1510 },
        { id: 'j4', nombre_completo: 'Jugador 4', ranking_elo: 1550 },
      ],
      error: null,
    },
    {
      data: [{ id: 'c1', nombre: 'Cancha Central' }],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);

  const semi = res.payload.find((p) => p.id === 'sf1');
  assert.ok(semi);
  assert.equal(semi.torneo_id, torneoId);
  assert.equal(semi.estado, 'programado');
  assert.equal(semi.jugador1_id, 'j1');
  assert.equal(semi.jugador2_id, 'j4');
  assert.equal(semi.jugador1_nombre, 'Jugador 1');
  assert.equal(semi.jugador2_nombre, 'Jugador 4');
  assert.equal(semi.jugador1_origen_partido_id, 'qf1');
  assert.equal(semi.jugador2_origen_partido_id, 'qf2');
  assert.equal(semi.cancha.id, 'c1');

  const cuarto = res.payload.find((p) => p.id === 'qf1');
  assert.ok(cuarto);
  assert.equal(cuarto.score, '6-4 6-3');
  assert.deepEqual(cuarto.resultado, { sets: [[6, 4], [6, 3]] });

  assertQueueEmpty();
});

test('GET cuadro deriva score y resultado desde marcador_en_vivo cuando faltan columnas nuevas', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    { data: null, error: { code: '42703', message: 'column "score" does not exist' } },
    {
      data: [
        {
          id: 'qf1',
          torneo_id: torneoId,
          ronda: 'Cuartos de Final',
          ronda_orden: 8,
          orden_en_ronda: 1,
          estado: 'finalizado',
          fecha_hora: '2026-03-07T10:00:00.000Z',
          cancha_id: null,
          marcador_en_vivo: { sets: [{ j1: 6, j2: 4 }, { j1: 6, j2: 2 }], ganador_id: 'j1' },
          ganador_id: 'j1',
          jugador1_id: 'j1',
          jugador2_id: 'j2',
          notas: null,
        },
      ],
      error: null,
    },
    {
      data: [
        { id: 'j1', nombre_completo: 'Jugador 1', ranking_elo: 1600 },
        { id: 'j2', nombre_completo: 'Jugador 2', ranking_elo: 1500 },
      ],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload.length, 1);
  assert.equal(res.payload[0].score, '6-4 6-2');
  assert.deepEqual(res.payload[0].resultado, { sets: [[6, 4], [6, 2]] });

  assertQueueEmpty();
});

test('GET cuadro alinea jugadores de ronda siguiente con ganadores de origen', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    {
      data: [
        {
          id: 'qf1',
          torneo_id: torneoId,
          ronda: 'Cuartos de Final',
          ronda_orden: 8,
          orden_en_ronda: 1,
          estado: 'finalizado',
          fecha_hora: '2026-03-07T10:00:00.000Z',
          cancha_id: null,
          marcador_en_vivo: null,
          score: '6-4 6-3',
          resultado: { sets: [[6, 4], [6, 3]] },
          ganador_id: 'j1',
          jugador1_id: 'j1',
          jugador2_id: 'j2',
          jugador1_origen_partido_id: null,
          jugador2_origen_partido_id: null,
        },
        {
          id: 'qf2',
          torneo_id: torneoId,
          ronda: 'Cuartos de Final',
          ronda_orden: 8,
          orden_en_ronda: 2,
          estado: 'finalizado',
          fecha_hora: '2026-03-07T12:00:00.000Z',
          cancha_id: null,
          marcador_en_vivo: null,
          score: '7-5 6-2',
          resultado: { sets: [[7, 5], [6, 2]] },
          ganador_id: 'j4',
          jugador1_id: 'j3',
          jugador2_id: 'j4',
          jugador1_origen_partido_id: null,
          jugador2_origen_partido_id: null,
        },
        {
          id: 'sf1',
          torneo_id: torneoId,
          ronda: 'Semifinal',
          ronda_orden: 4,
          orden_en_ronda: 1,
          estado: 'finalizado',
          fecha_hora: '2026-03-08T10:00:00.000Z',
          cancha_id: null,
          marcador_en_vivo: null,
          score: null,
          resultado: null,
          ganador_id: 'existing-2',
          jugador1_id: 'existing-1',
          jugador2_id: 'existing-2',
          jugador1_origen_partido_id: 'qf1',
          jugador2_origen_partido_id: 'qf2',
        },
      ],
      error: null,
    },
    {
      data: [
        { id: 'j1', nombre_completo: 'Jugador 1', ranking_elo: 1600 },
        { id: 'j2', nombre_completo: 'Jugador 2', ranking_elo: 1500 },
        { id: 'j3', nombre_completo: 'Jugador 3', ranking_elo: 1510 },
        { id: 'j4', nombre_completo: 'Jugador 4', ranking_elo: 1550 },
        { id: 'existing-1', nombre_completo: 'Roger', ranking_elo: 1284 },
        { id: 'existing-2', nombre_completo: 'Novak Djokovic', ranking_elo: 1300 },
      ],
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 200);
  const semi = res.payload.find((p) => p.id === 'sf1');
  assert.ok(semi);
  assert.equal(semi.jugador1_id, 'j1');
  assert.equal(semi.jugador2_id, 'j4');
  assert.equal(semi.ganador_id, null);
  assert.equal(semi.estado, 'programado');

  assertQueueEmpty();
});

test('helpers de cronograma: defaults y slots por dia/cancha', () => {
  const config = __private.parseSchedulerConfig({});
  assert.equal(config.error, undefined);
  assert.equal(config.horaInicioDia, '09:00');
  assert.equal(config.horaFinDia, '22:00');
  assert.equal(config.duracionTurno, 90);

  const days = __private.listTournamentDays(
    new Date('2026-03-07T00:00:00.000Z'),
    new Date('2026-03-08T00:00:00.000Z'),
  );

  const slots = __private.buildSlots({
    days,
    canchaIds: ['c1', 'c2'],
    horaInicioMin: 9 * 60,
    horaFinMin: 12 * 60,
    duracionTurno: 90,
  });

  // 2 dias * 2 turnos por dia * 2 canchas
  assert.equal(slots.length, 8);
});

test('helpers de cronograma: descanso minimo de 60 minutos', () => {
  const slotCon45MinDescanso = {
    startMin: 11 * 60 + 30,
    endMin: 13 * 60,
  };

  const slotCon60MinDescanso = {
    startMin: 12 * 60,
    endMin: 13 * 60 + 30,
  };

  const partidosPrevios = [{ startMin: 9 * 60, endMin: 10 * 60 + 45 }];

  assert.equal(
    __private.hasRestConflict(partidosPrevios, slotCon45MinDescanso, 60),
    true,
  );

  assert.equal(
    __private.hasRestConflict(partidosPrevios, slotCon60MinDescanso, 60),
    false,
  );
});

test('helpers de sorteo: siembra top 4 en posiciones fijas para cuadro de 8/16/32', () => {
  const scenarios = [
    { size: 8, expected: { s1: 1, s2: 8, s3: 3, s4: 6 } },
    { size: 16, expected: { s1: 1, s2: 16, s3: 5, s4: 12 } },
    { size: 32, expected: { s1: 1, s2: 32, s3: 9, s4: 24 } },
  ];

  for (const scenario of scenarios) {
    const jugadores = Array.from({ length: scenario.size }, (_, idx) => ({
      jugador_id: `j${idx + 1}`,
      perfil: { ranking_puntos: scenario.size - idx },
    }));

    const entrants = __private.placeTopSeedsByRanking(jugadores, scenario.size, () => 0);

    assert.equal(entrants[scenario.expected.s1 - 1].jugador_id, 'j1');
    assert.equal(entrants[scenario.expected.s2 - 1].jugador_id, 'j2');
    assert.equal(entrants[scenario.expected.s3 - 1].jugador_id, 'j3');
    assert.equal(entrants[scenario.expected.s4 - 1].jugador_id, 'j4');

    const quarterSize = scenario.size / 4;
    const quarters = [
      Math.floor((scenario.expected.s1 - 1) / quarterSize),
      Math.floor((scenario.expected.s2 - 1) / quarterSize),
      Math.floor((scenario.expected.s3 - 1) / quarterSize),
      Math.floor((scenario.expected.s4 - 1) / quarterSize),
    ];

    assert.equal(new Set(quarters).size, 4);
  }
});

test('helpers de sorteo: seed 3 y 4 se sortean entre las dos posiciones definidas', () => {
  const jugadores = Array.from({ length: 8 }, (_, idx) => ({ jugador_id: `j${idx + 1}` }));

  const entrantsNoSwap = __private.placeTopSeedsByRanking(jugadores, 8, () => 0.1);
  assert.equal(entrantsNoSwap[2].jugador_id, 'j3');
  assert.equal(entrantsNoSwap[5].jugador_id, 'j4');

  const entrantsSwap = __private.placeTopSeedsByRanking(jugadores, 8, () => 0.9);
  assert.equal(entrantsSwap[2].jugador_id, 'j4');
  assert.equal(entrantsSwap[5].jugador_id, 'j3');
});

test('generarSorteo agenda cuadro completo y prioriza domingo para la final', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const jugadores = Array.from({ length: 8 }, (_, idx) => ({ jugador_id: `j${idx + 1}` }));
  const perfiles = Array.from({ length: 8 }, (_, idx) => ({
    id: `j${idx + 1}`,
    nombre_completo: `Jugador ${idx + 1}`,
    ranking_elo_singles: 1700 - idx * 10,
  }));

  const disponibilidadInscripcion = jugadores.map((j) => ({
    jugador_id: j.jugador_id,
    fecha: '2026-03-07',
    dia_semana: 6,
    hora_inicio: '09:00',
    hora_fin: '22:00',
  }));

  const queue = [
    {
      data: {
        id: torneoId,
        fecha_inicio: '2026-03-07T09:00:00Z',
        fecha_fin: '2026-03-08T22:00:00Z',
      },
      error: null,
    },
    { count: 0, error: null },
    {
      data: [{ cancha_id: 'c1' }, { cancha_id: 'c2' }],
      error: null,
    },
    {
      data: [{ id: 'c1' }, { id: 'c2' }],
      error: null,
    },
    { data: jugadores, error: null },
    { data: perfiles, error: null },
    { data: disponibilidadInscripcion, error: null },
    (state) => ({
      data: state.payload.map((p, i) => ({ id: `p_${i + 1}`, ...p })),
      error: null,
    }),
    { data: null, error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId }, body: {} });
  const res = createRes();

  await generarSorteo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.config.hora_inicio_dia, '09:00');
  assert.equal(res.payload.config.hora_fin_dia, '22:00');
  assert.equal(res.payload.config.duracion_turno, 90);

  const insertCall = calls.find((c) => c.table === 'partidos' && c.action === 'insert');
  assert.ok(insertCall, 'Se esperaba insercion de partidos');
  assert.equal(insertCall.payload.length, 7); // Cuartos (4) + Semis (2) + Final (1)

  const conSlot = insertCall.payload.filter((p) => p.fecha_hora && p.cancha_id);
  assert.equal(conSlot.length, 7);

  const finalMatch = insertCall.payload.find((p) => p.ronda_orden === 2);
  assert.ok(finalMatch, 'Se esperaba partido final');
  assert.equal(new Date(finalMatch.fecha_hora).getUTCDay(), 0); // Domingo

  const semis = insertCall.payload.filter((p) => p.ronda_orden === 4);
  assert.equal(semis.length, 2);
  for (const semi of semis) {
    assert.equal(new Date(semi.fecha_hora).getUTCDay(), 6); // Sabado
  }

  assertQueueEmpty();
});

test('generarSorteo tolera perfiles sin ranking_elo legacy', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    {
      data: {
        id: torneoId,
        fecha_inicio: '2026-03-07T09:00:00Z',
        fecha_fin: '2026-03-08T22:00:00Z',
      },
      error: null,
    },
    { count: 0, error: null },
    { data: [{ cancha_id: 'c1' }], error: null },
    { data: [{ id: 'c1' }], error: null },
    { data: [{ jugador_id: 'j1' }, { jugador_id: 'j2' }], error: null },
    { data: [{ id: 'j1', ranking_elo_singles: 1500 }, { id: 'j2', ranking_elo_singles: 1400 }], error: null },
    {
      data: [
        { jugador_id: 'j1', fecha: '2026-03-07', dia_semana: 6, hora_inicio: '09:00', hora_fin: '22:00' },
        { jugador_id: 'j2', fecha: '2026-03-07', dia_semana: 6, hora_inicio: '09:00', hora_fin: '22:00' },
      ],
      error: null,
    },
    (state) => ({ data: state.payload.map((p, i) => ({ id: `p_${i + 1}`, ...p })), error: null }),
    { data: null, error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId }, body: {} });
  const res = createRes();

  await generarSorteo(req, res);

  assert.equal(res.statusCode, 200);

  assertQueueEmpty();
});

test('recalcularCronograma reprograma sin regenerar cuadro y prioriza domingo para final', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    {
      data: {
        id: torneoId,
        fecha_inicio: '2026-03-07T09:00:00Z',
        fecha_fin: '2026-03-08T22:00:00Z',
      },
      error: null,
    },
    {
      data: [{ cancha_id: 'c1' }, { cancha_id: 'c2' }],
      error: null,
    },
    {
      data: [{ id: 'c1' }, { id: 'c2' }],
      error: null,
    },
    {
      data: [
        {
          id: 'p1',
          torneo_id: torneoId,
          ronda: 'Semifinal',
          ronda_orden: 4,
          jugador1_id: 'j1',
          jugador2_id: 'j2',
          ganador_id: null,
          fecha_hora: null,
          cancha_id: null,
          estado: 'programado',
          notas: null,
        },
        {
          id: 'p2',
          torneo_id: torneoId,
          ronda: 'Semifinal',
          ronda_orden: 4,
          jugador1_id: 'j3',
          jugador2_id: 'j4',
          ganador_id: null,
          fecha_hora: null,
          cancha_id: null,
          estado: 'programado',
          notas: null,
        },
        {
          id: 'p3',
          torneo_id: torneoId,
          ronda: 'Final',
          ronda_orden: 2,
          jugador1_id: null,
          jugador2_id: null,
          ganador_id: null,
          fecha_hora: null,
          cancha_id: null,
          estado: 'programado',
          notas: null,
        },
      ],
      error: null,
    },
    {
      data: [
        { jugador_id: 'j1', fecha: '2026-03-07', dia_semana: 6, hora_inicio: '09:00', hora_fin: '22:00' },
        { jugador_id: 'j2', fecha: '2026-03-07', dia_semana: 6, hora_inicio: '09:00', hora_fin: '22:00' },
        { jugador_id: 'j3', fecha: '2026-03-07', dia_semana: 6, hora_inicio: '09:00', hora_fin: '22:00' },
        { jugador_id: 'j4', fecha: '2026-03-07', dia_semana: 6, hora_inicio: '09:00', hora_fin: '22:00' },
      ],
      error: null,
    },
    { data: null, error: null },
    { data: null, error: null },
    { data: null, error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId }, body: {} });
  const res = createRes();

  await recalcularCronograma(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.resumen.partidos_reprogramados, 3);

  const updateCalls = calls.filter((c) => c.table === 'partidos' && c.action === 'update');
  assert.equal(updateCalls.length, 3);

  const updateById = new Map(
    updateCalls.map((call) => {
      const idFilter = call.filters.find((f) => f.op === 'eq' && f.column === 'id');
      return [idFilter ? idFilter.value : null, call.payload];
    }),
  );

  const finalUpdate = updateById.get('p3');
  assert.ok(finalUpdate);
  assert.ok(finalUpdate.fecha_hora);
  assert.equal(new Date(finalUpdate.fecha_hora).getUTCDay(), 0);

  assertQueueEmpty();
});

test('publicarCronograma publica y actualiza estado del torneo', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId, estado: 'publicado' }, error: null },
    { count: 7, error: null },
    { count: 1, error: null },
    { data: { id: torneoId, estado: 'en_progreso' }, error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId }, body: {} });
  const res = createRes();

  await publicarCronograma(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.torneo.estado, 'en_progreso');
  assert.equal(res.payload.resumen.total_partidos, 7);

  assertQueueEmpty();
});

test('publicarCronograma ignora estado invalido y usa en_progreso', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId, estado: 'publicado' }, error: null },
    { count: 4, error: null },
    { count: 0, error: null },
    { data: { id: torneoId, estado: 'en_progreso' }, error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId }, body: { estado: 'desconocido_front' } });
  const res = createRes();

  await publicarCronograma(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.torneo.estado, 'en_progreso');
  assertQueueEmpty();
});
