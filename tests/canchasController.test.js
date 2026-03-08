const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const supabase = require('../services/supabase');
const buildCanchasController = require('../controllers/canchasController');

const originalFrom = supabase.from;

function createReq({ params = {}, body = {}, query = {} } = {}) {
  return { params, body, query };
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
      order: null,
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
      delete() {
        state.action = 'delete';
        return this;
      },
      eq(column, value) {
        state.filters.push({ op: 'eq', column, value });
        return this;
      },
      order(column, options) {
        state.order = { column, options };
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

test('POST /api/canchas crea cancha valida', async () => {
  const calls = [];
  const queue = [
    {
      data: {
        id: 'cancha_1',
        nombre: 'Cancha Central',
        tipo_superficie: 'polvo de ladrillo',
        esta_disponible: true,
        descripcion: 'Techada',
      },
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const controller = buildCanchasController(null);
  const req = createReq({
    body: {
      nombre: 'Cancha Central',
      tipo_superficie: 'polvo de ladrillo',
      descripcion: 'Techada',
    },
  });
  const res = createRes();

  await controller.crearCancha(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.cancha.id, 'cancha_1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'canchas');
  assert.equal(calls[0].action, 'insert');

  assertQueueEmpty();
});

test('PUT /api/canchas/:id edita cancha', async () => {
  const calls = [];
  const queue = [
    {
      data: {
        id: 'cancha_1',
        nombre: 'Cancha Central',
        tipo_superficie: 'sintetica',
        esta_disponible: true,
        descripcion: 'Renovada',
      },
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const controller = buildCanchasController(null);
  const req = createReq({
    params: { id: 'cancha_1' },
    body: {
      tipo_superficie: 'sintetica',
      descripcion: 'Renovada',
    },
  });
  const res = createRes();

  await controller.actualizarCancha(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.cancha.tipo_superficie, 'sintetica');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'canchas');
  assert.equal(calls[0].action, 'update');

  assertQueueEmpty();
});

test('DELETE /api/canchas/:id elimina cancha', async () => {
  const calls = [];
  const queue = [
    { data: { id: 'cancha_1' }, error: null },
    { error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const controller = buildCanchasController(null);
  const req = createReq({ params: { id: 'cancha_1' } });
  const res = createRes();

  await controller.eliminarCancha(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /eliminada/i);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].action, 'select');
  assert.equal(calls[1].action, 'delete');

  assertQueueEmpty();
});

test('DELETE /api/canchas/:id retorna 409 con relacion activa', async () => {
  const calls = [];
  const queue = [
    { data: { id: 'cancha_1' }, error: null },
    { error: { code: '23503', message: 'foreign key violation' } },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const controller = buildCanchasController(null);
  const req = createReq({ params: { id: 'cancha_1' } });
  const res = createRes();

  await controller.eliminarCancha(req, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.payload.error, /asociada/i);
  assert.equal(calls.length, 2);

  assertQueueEmpty();
});
