// Vercel serverless: GET (lista) e POST (cadastra) /api/produtos
// Blindada: qualquer falha retorna JSON com a causa, nunca FUNCTION_INVOCATION_FAILED.
let h = null;
let erroCarga = null;
try {
  h = require('../lib/handlers');
} catch (e) {
  erroCarga = e;
}

function responder(res, status, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status);
  res.end(JSON.stringify(obj));
}

module.exports = async function (req, res) {
  try {
    if (!h) return responder(res, 500, { erro: 'Falha ao carregar modulos: ' + String(erroCarga && erroCarga.message || erroCarga) });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return responder(res, 500, { erro: 'Variaveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nao configuradas na Vercel (Settings -> Environment Variables)' });
    }

    if (req.method === 'GET') {
      const lista = await h.listar();
      return responder(res, 200, lista);
    }
    if (req.method === 'POST') {
      const { lerCorpo } = require('../lib/ler-corpo');
      const corpo = await lerCorpo(req);
      const r = await h.criar(corpo && typeof corpo === 'object' ? corpo : {});
      return responder(res, r.status, r.dados);
    }
    res.setHeader('Allow', 'GET, POST');
    return responder(res, 405, { erro: 'Metodo nao permitido' });
  } catch (err) {
    return responder(res, 500, { erro: String((err && err.message) || err) });
  }
};
