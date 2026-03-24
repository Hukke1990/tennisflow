const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const supabase = require('../services/supabase');
const rankingsController = require('../controllers/rankingsController');

const originalFrom = supabase.from;

// UUID válido para tests (pasa UUID_REGEX del controller)
const TEST_CLUB_ID = '33333333-3333-4333-8333-333333333333';

function createReq({ query = {} } = {}) {
  return { query: { club_id: TEST_CLUB_ID, ...query } };
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
  // Flujo: perfiles(rankings) → perfiles(admins) → torneos → partidos
  const queue = [
    {
      data: [
        {
          id: 'j1',
          nombre_completo: 'Jugador 1',
          foto_url: null,
          ranking_puntos_singles: 100,
          ranking_puntos: 100,
          ranking_elo_singles: 1650,
          ranking_elo_dobles: 1500,
          ranking_elo: 1600,
        },
      ],
      error: null,
    },
    {
      // fetchAdminProfileIdsCompat — no hay admins
      data: [{ id: 'admin-1', rol: 'admin', es_admin: true }],
      error: null,
    },
    {
      // fetchClubTournamentIds — torneos del club
      data: [{ id: 't1' }, { id: 't2' }],
      error: null,
    },
    {
      // fetchTournamentWinsByPlayers — partidos finales
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

  assert.equal(calls.length, 4);
  assert.equal(calls[0].table, 'perfiles');
  assert.equal(calls[1].table, 'perfiles');
  assert.deepEqual(calls[0].filters.find((f) => f.column === 'sexo'), {
    op: 'eq', column: 'sexo', value: 'Masculino',
  });
  assert.deepEqual(calls[0].filters.find((f) => f.column === 'categoria_singles'), {
    op: 'eq', column: 'categoria_singles', value: 1,
  });
  assert.equal(calls[2].table, 'torneos');
  assert.equal(calls[3].table, 'partidos');
  assert.equal(res.payload[0].torneos, 2);

  assertQueueEmpty();
});

test('Singles + Femenino + categoria 3', async () => {
  const calls = [];
  // Sin rows → no hay fetchAdminProfileIdsCompat. fetchClubTournamentIds siempre se llama.
  const queue = [
    { data: [], error: null },  // perfiles (rankings) — sin jugadoras
    { data: [], error: null },  // torneos (fetchClubTournamentIds)
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ query: { modalidad: 'Singles', sexo: 'Femenino', categoria: '3' } });
  const res = createRes();

  await rankingsController.getRankings(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload.length, 0);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].table, 'perfiles');
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
  const queue = [
    { data: [], error: null },  // perfiles (rankings)
    { data: [], error: null },  // torneos (fetchClubTournamentIds)
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ query: { modalidad: 'Dobles', sexo: 'Masculino', categoria: '2' } });
  const res = createRes();

  await rankingsController.getRankings(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].table, 'perfiles');
  assert.deepEqual(calls[0].filters.find((f) => f.column === 'categoria_dobles'), {
    op: 'eq', column: 'categoria_dobles', value: 2,
  });

  assertQueueEmpty();
});

test('query invalida modalidad=Mixta retorna 400', async () => {
  const calls = [];
  const queue = [];
  mockSupabaseWithQueue(queue, calls);

  // club_id válido incluido por createReq; el error es por modalidad inválida
  const req = createReq({ query: { modalidad: 'Mixta' } });
  const res = createRes();

  await rankingsController.getRankings(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /modalidad/i);
  assert.equal(calls.length, 0);
});

test('ordena desc por puntos', async () => {
  const calls = [];
  // Flujo: perfiles(rankings) → perfiles(admins) → torneos(club) → partidos(wins)
  const queue = [
    {
      // perfiles — rankings
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
        },
      ],
      error: null,
    },
    {
      // perfiles — fetchAdminProfileIdsCompat (sin admins)
      data: [],
      error: null,
    },
    {
      // torneos — fetchClubTournamentIds
      data: [{ id: 'torneo_1' }, { id: 'torneo_2' }, { id: 'torneo_3' }],
      error: null,
    },
    {
      // partidos — fetchTournamentWinsByPlayers
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

test('excluye admin y super_admin del ranking', async () => {
  const calls = [];
  // Flujo: perfiles(rankings) → perfiles(admins) → torneos(club)
  // playerIds=['jugador-id'], clubTournamentIds=[] → sin partidos query
  const queue = [
    {
      // perfiles — rankings (admin + jugador normal)
      data: [
        {
          id: 'admin-id',
          nombre_completo: 'Admin User',
          foto_url: null,
          ranking_puntos_singles: 999,
          ranking_puntos: 999,
          ranking_elo_singles: 2000,
          ranking_elo_dobles: 1900,
          ranking_elo: 2000,
        },
        {
          id: 'jugador-id',
          nombre_completo: 'Jugador Normal',
          foto_url: null,
          ranking_puntos_singles: 100,
          ranking_puntos: 100,
          ranking_elo_singles: 1600,
          ranking_elo_dobles: 1500,
          ranking_elo: 1600,
        },
      ],
      error: null,
    },
    {
      // perfiles — fetchAdminProfileIdsCompat
      data: [
        { id: 'admin-id',       rol: 'admin',       es_admin: false },
        { id: 'super-admin-id', rol: 'super_admin',  es_admin: false },
      ],
      error: null,
    },
    {
      // torneos — fetchClubTournamentIds (sin torneos → no llamada a partidos)
      data: [],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ query: { modalidad: 'Singles', sexo: 'Masculino', categoria: '3' } });
  const res = createRes();

  await rankingsController.getRankings(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.length, 1);
  assert.equal(res.payload[0].id, 'jugador-id');
  assert.equal(calls[0].table, 'perfiles');
  assert.equal(calls[1].table, 'perfiles');
  assert.equal(calls[2].table, 'torneos');

  assertQueueEmpty();
});
