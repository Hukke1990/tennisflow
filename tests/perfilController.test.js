const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const supabase = require('../services/supabase');
const { actualizarPerfil } = require('../controllers/perfilController');

const originalFrom = supabase.from;

function createReq({ params = {}, body = {}, authUser = {} } = {}) {
  return { params, body, authUser };
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

afterEach(() => {
  supabase.from = originalFrom;
});

test('jugador no puede editar categoria_singles/categoria_dobles', async () => {
  let called = false;
  supabase.from = () => {
    called = true;
    throw new Error('No deberia consultar DB para este caso');
  };

  const req = createReq({
    params: { id: 'user-1' },
    authUser: { id: 'user-1', rol: 'jugador' },
    body: {
      categoria_singles: 2,
      categoria_dobles: 3,
    },
  });
  const res = createRes();

  await actualizarPerfil(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(String(res.payload?.error || ''), /solo admin o super_admin/i);
  assert.equal(called, false);
});

test('admin puede editar categorias y sincroniza categoria legacy', async () => {
  let capturedUpdate = null;

  supabase.from = (table) => {
    assert.equal(table, 'perfiles');

    return {
      update(payload) {
        capturedUpdate = payload;
        return this;
      },
      eq(column, value) {
        assert.equal(column, 'id');
        assert.equal(value, 'target-user');
        return this;
      },
      select() {
        return this;
      },
      single() {
        return Promise.resolve({
          data: {
            id: 'target-user',
            categoria: capturedUpdate.categoria,
            categoria_singles: capturedUpdate.categoria_singles,
            categoria_dobles: capturedUpdate.categoria_dobles,
          },
          error: null,
        });
      },
    };
  };

  const req = createReq({
    params: { id: 'target-user' },
    authUser: { id: 'admin-user', rol: 'admin' },
    body: {
      categoria_singles: 2,
      categoria_dobles: 4,
    },
  });
  const res = createRes();

  await actualizarPerfil(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(capturedUpdate.categoria_singles, 2);
  assert.equal(capturedUpdate.categoria_dobles, 4);
  assert.equal(capturedUpdate.categoria, 2);
  assert.equal(res.payload?.perfil?.categoria, 2);
});

test('perfil rechaza telefono con formato invalido', async () => {
  let called = false;
  supabase.from = () => {
    called = true;
    throw new Error('No deberia consultar DB para telefono invalido');
  };

  const req = createReq({
    params: { id: 'user-1' },
    authUser: { id: 'user-1', rol: 'jugador' },
    body: {
      telefono: '011-2233-4455',
    },
  });
  const res = createRes();

  await actualizarPerfil(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(String(res.payload?.error || ''), /telefono/i);
  assert.equal(called, false);
});

test('perfil guarda telefono internacional valido', async () => {
  let capturedUpdate = null;

  supabase.from = (table) => {
    assert.equal(table, 'perfiles');

    return {
      update(payload) {
        capturedUpdate = payload;
        return this;
      },
      eq(column, value) {
        assert.equal(column, 'id');
        assert.equal(value, 'user-1');
        return this;
      },
      select() {
        return this;
      },
      single() {
        return Promise.resolve({
          data: {
            id: 'user-1',
            telefono: capturedUpdate.telefono,
          },
          error: null,
        });
      },
    };
  };

  const req = createReq({
    params: { id: 'user-1' },
    authUser: { id: 'user-1', rol: 'jugador' },
    body: {
      telefono: '+5491122334455',
    },
  });
  const res = createRes();

  await actualizarPerfil(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(capturedUpdate.telefono, '+5491122334455');
  assert.equal(res.payload?.perfil?.telefono, '+5491122334455');
});
