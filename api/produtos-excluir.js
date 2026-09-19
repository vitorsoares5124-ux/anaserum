// Vercel serverless: POST /api/produtos-excluir  { id: 123 }
const h = require('../lib/handlers');

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).end(JSON.stringify({ erro: 'Metodo nao permitido' }));
    }
    const r = await h.excluir((req.body || {}).id);
    return res.status(r.status).end(JSON.stringify(r.dados));
  } catch (err) {
    return res.status(500).end(JSON.stringify({ erro: String((err && err.message) || err) }));
  }
};
