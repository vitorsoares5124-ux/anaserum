// Vercel serverless: GET (lista) e POST (cadastra) /api/produtos
const h = require('../lib/handlers');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if (req.method === 'GET') {
      const lista = await h.listar();
      return res.status(200).end(JSON.stringify(lista));
    }
    if (req.method === 'POST') {
      const r = await h.criar(req.body || {});
      return res.status(r.status).end(JSON.stringify(r.dados));
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end(JSON.stringify({ erro: 'Metodo nao permitido' }));
  } catch (err) {
    return res.status(500).end(JSON.stringify({ erro: String((err && err.message) || err) }));
  }
};
