const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const supabase = require('../services/supabase');
const rankingsController = require('../controllers/rankingsController');

const originalFrom = supabase.from;

function createReq({ query = {} } = {}) {
  return { query };
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
      filters: [],
      selectArgs: null,
      order: [],
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
        state.action = 'select';
        state.selectArgs = { columns, options };
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
      not(column, operator, value) {
        state.filters.push({ op: 'not', column, operator, value });
        return this;
      },
      order(column, options) {
        state.order.push({ column, options });
        return this;
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

test('Singles + Masculino + categoria 1', async () => {
  const calls = [];
  const queue = [
    {
      data: [
        {
          id: 'j1',
          nombre_completo: 'Jugador 1',
          foto_url: null,
          ranking_elo_singles: 1650,
          ranking_elo_dobles: 1500,
          ranking_elo: 1600,
          torneos: 3,
          victorias: 2,
        },
      ],
      error: null,
    },
    {
      data: [
        { ganador_id: 'j1', torneo_id: 't1' },
        { ganador_id: 'j1', torneo_id: 't2' },
      ],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ query: { modalidad: 'Singles', sexo: 'Masculino', categoria: '1' } });
  const res = createRes();

  await rankingsController.getRankings(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload[0].id, 'j1');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].table, 'vw_rankings_perfiles');
  assert.deepEqual(calls[0].filters.find((f) => f.column === 'sexo'), {
    op: 'eq', column: 'sexo', value: 'Masculino',
  });
  assert.deepEqual(calls[0].filters.find((f) => f.column === 'categoria_singles'), {
    op: 'eq', column: 'categoria_singles', value: 1,
  });
  assert.equal(calls[1].table, 'partidos');
  assert.equal(res.payload[0].torneos, 2);

  assertQueueEmpty();
});

test('Singles + Femenino + categoria 3', async () => {
  const calls = [];
  const queue = [{ data: [], error: null }];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ query: { modalidad: 'Singles', sexo: 'Femenino', categoria: '3' } });
  const res = createRes();

  await rankingsController.getRankings(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload.length, 0);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].filters.find((f) => f.column === 'sexo'), {
    op: 'eq', column: 'sexo', value: 'Femenino',
  });
  assert.deepEqual(calls[0].filters.find((f) => f.column === 'categoria_singles'), {
    op: 'eq', column: 'categoria_singles', value: 3,
  });

  assertQueueEmpty();
});

test('Dobles + Masculino + categoria 2', async () => {
  const calls = [];
  const queue = [{ data: [], error: null }];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ query: { modalidad: 'Dobles', sexo: 'Masculino', categoria: '2' } });
  const res = createRes();

  await rankingsController.getRankings(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].filters.find((f) => f.column === 'categoria_dobles'), {
    op: 'eq', column: 'categoria_dobles', value: 2,
  });

  assertQueueEmpty();
});

test('query invalida modalidad=Mixta retorna 400', async () => {
  const calls = [];
  const queue = [];
  mockSupabaseWithQueue(queue, calls);

  const req = createReq({ query: { modalidad: 'Mixta' } });
  const res = createRes();

  await rankingsController.getRankings(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /modalidad/i);
  assert.equal(calls.length, 0);
});

test('ordena desc por puntos', async () => {
  const calls = [];
  const queue = [
    {
      data: [
        {
          id: 'j2',
          nombre_completo: 'Jugador 2',
          foto_url: null,
          ranking_puntos_singles: 120,
          ranking_puntos: 120,
          ranking_elo_singles: null,
          ranking_elo_dobles: 1400,
          ranking_elo: 1700,
          torneos: null,
          victorias: null,
        },
        {
          id: 'j1',
          nombre_completo: 'Jugador 1',
          foto_url: null,
          ranking_puntos_singles: 80,
          ranking_puntos: 80,
          ranking_elo_singles: 1650,
          ranking_elo_dobles: 1350,
          ranking_elo: 1600,
          torneos: 1,
          victorias: 1,
        },
      ],
      error: null,
    },
    {
      data: [
        { ganador_id: 'j2', torneo_id: 'torneo_1' },
        { ganador_id: 'j1', torneo_id: 'torneo_2' },
        { ganador_id: 'j1', torneo_id: 'torneo_3' },
      ],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ query: { modalidad: 'Singles', sexo: 'Masculino', categoria: '1' } });
  const res = createRes();

  await rankingsController.getRankings(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload[0].id, 'j2');
  assert.equal(res.payload[0].ranking_puntos_singles, 120);
  assert.equal(res.payload[0].torneos, 1);
  assert.equal(res.payload[0].victorias, 0);
  assert.equal(res.payload[1].id, 'j1');
  assert.equal(res.payload[1].ranking_puntos_singles, 80);
  assert.equal(res.payload[1].torneos, 2);

  assertQueueEmpty();
});
