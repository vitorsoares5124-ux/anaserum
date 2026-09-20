// Vercel serverless: GET /api/catalogo — catálogo público da loja.
// Sem segredos: só slugs, nomes e mapas de correspondência (sem preços,
// sem variant_id). O front usa para marcar produtos sem variant_id como
// indisponíveis; a resolução para variant_id acontece só no backend.
var catalogo = require('../lib/produtos-nuvemshop');

function responder(res, status, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status);
  res.end(JSON.stringify(obj));
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return responder(res, 405, { erro: 'Metodo nao permitido' });
    }
    return responder(res, 200, {
      produtos: catalogo.CATALOGO.map(function (p) { return { slug: p.slug, nome: p.nome }; }),
      supabaseIdMap: catalogo.SUPABASE_ID_MAP,
      aliases: catalogo.ALIAS_SLUG
    });
  } catch (err) {
    return responder(res, 500, { erro: String((err && err.message) || err) });
  }
};
