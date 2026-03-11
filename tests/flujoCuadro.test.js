const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const supabase = require('../services/supabase');
const partidosController = require('../controllers/partidosController');
const { obtenerCuadroTorneo } = require('../controllers/sorteoController');

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
      selectArgs: null,
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
      select(columns) {
        if (!state.action) state.action = 'select';
        state.selectArgs = { columns };
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
        state.filters.push({ op: 'in', column, values });
        return this;
      },
      order() {
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

test('flujo finalizar partido -> propagar ganador -> consultar cuadro', async () => {
  const calls = [];
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const queue = [
    // cargarResultado
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        orden_en_ronda: 1,
        estado: 'en_juego',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        estado: 'finalizado',
        ganador_id: 'j1',
        score: '6-3 6-4',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    {
      data: [
        { id: partidoId, orden_en_ronda: 1, jugador1_id: 'j1', jugador2_id: 'j2', ganador_id: 'j1' },
        { id: 'q2', orden_en_ronda: 2, jugador1_id: 'j3', jugador2_id: 'j4', ganador_id: null },
      ],
      error: null,
    },
    {
      data: [
        { id: 's1', orden_en_ronda: 1, jugador1_id: null, jugador2_id: null, estado: 'programado' },
        { id: 's2', orden_en_ronda: 2, jugador1_id: null, jugador2_id: null, estado: 'programado' },
      ],
      error: null,
    },
    {
      data: {
        id: 's1',
        torneo_id: torneoId,
        ronda_orden: 4,
        jugador1_id: 'j1',
        jugador2_id: null,
        estado: 'programado',
      },
      error: null,
    },
    // obtenerCuadroTorneo
    { data: { id: torneoId }, error: null },
    {
      data: [
        {
          id: partidoId,
          torneo_id: torneoId,
          ronda: 'Cuartos de Final',
          ronda_orden: 8,
          orden_en_ronda: 1,
          estado: 'finalizado',
          fecha_hora: '2026-03-08T10:00:00.000Z',
          cancha_id: 'c1',
          score: '6-3 6-4',
          resultado: { sets: [[6, 3], [6, 4]] },
          ganador_id: 'j1',
          jugador1_id: 'j1',
          jugador2_id: 'j2',
          jugador1_origen_partido_id: null,
          jugador2_origen_partido_id: null,
        },
        {
          id: 'q2',
          torneo_id: torneoId,
          ronda: 'Cuartos de Final',
          ronda_orden: 8,
          orden_en_ronda: 2,
          estado: 'programado',
          fecha_hora: '2026-03-08T12:00:00.000Z',
          cancha_id: 'c1',
          score: null,
          resultado: null,
          ganador_id: null,
          jugador1_id: 'j3',
          jugador2_id: 'j4',
          jugador1_origen_partido_id: null,
          jugador2_origen_partido_id: null,
        },
        {
          id: 's1',
          torneo_id: torneoId,
          ronda: 'Semifinal',
          ronda_orden: 4,
          orden_en_ronda: 1,
          estado: 'programado',
          fecha_hora: '2026-03-09T10:00:00.000Z',
          cancha_id: 'c1',
          score: null,
          resultado: null,
          ganador_id: null,
          jugador1_id: 'j1',
          jugador2_id: null,
          jugador1_origen_partido_id: partidoId,
          jugador2_origen_partido_id: 'q2',
        },
      ],
      error: null,
    },
    {
      data: [
        { id: 'j1', nombre_completo: 'Jugador 1', ranking_elo: 1512 },
        { id: 'j2', nombre_completo: 'Jugador 2', ranking_elo: 1388 },
        { id: 'j3', nombre_completo: 'Jugador 3', ranking_elo: 1490 },
        { id: 'j4', nombre_completo: 'Jugador 4', ranking_elo: 1500 },
      ],
      error: null,
    },
    { data: [{ id: 'c1', nombre: 'Cancha Central' }], error: null },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const reqResultado = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j1', score: '6-3 6-4', resultado: { sets: [[6, 3], [6, 4]] }, finalizar: true },
  });
  const resResultado = createRes();

  await partidosController.cargarResultado(reqResultado, resResultado);

  assert.equal(resResultado.statusCode, 200);
  assert.equal(resResultado.payload.siguiente_partido.id, 's1');

  const reqCuadro = createReq({ params: { id: torneoId } });
  const resCuadro = createRes();

  await obtenerCuadroTorneo(reqCuadro, resCuadro);

  assert.equal(resCuadro.statusCode, 200);
  const partidoFinalizado = resCuadro.payload.find((p) => p.id === partidoId);
  assert.equal(partidoFinalizado.ganador_id, 'j1');
  assert.equal(partidoFinalizado.score, '6-3 6-4');

  const semi = resCuadro.payload.find((p) => p.id === 's1');
  assert.equal(semi.jugador1_id, 'j1');
  assert.equal(semi.jugador1_nombre, 'Jugador 1');

  assertQueueEmpty();
});
