// =====================================================================
// FONTE ÚNICA DE VERDADE — Catálogo Nuvemshop DermAna
// ---------------------------------------------------------------------
// Lista atualizada (8 produtos). Todo o projeto deve ler daqui:
//   - api/pedido.js resolve slug/product_id/variant_id -> variant_id
//   - Preços abaixo são SOMENTE referência. NUNCA cobrar por eles:
//     o backend envia apenas { variant_id, quantity } para
//     POST /draft_orders e o preço vem sempre da Nuvemshop.
// =====================================================================

var CATALOGO = [
  { slug: 'serum-antioxidante-dermana', nome: 'Serum Antioxidante DermAna', product_id: 314344180, variant_id: 1392130929, precoReferencia: 'R$ 85,00' },
  { slug: 'kit-dermana-diario', nome: 'Kit DermAna Diário', product_id: 315083475, variant_id: 1395798129, precoReferencia: 'R$ 170,00' },
  { slug: 'sabonete-renovador-dermana', nome: 'Sabonete Renovador DermAna', product_id: 315084106, variant_id: 1395799510, precoReferencia: 'R$ 85,00' },
  { slug: 'renova-skin', nome: 'Renova Skin – Sérum Dermocosmético Clareador de Alta Performance', product_id: 315178393, variant_id: 1396333916, precoReferencia: 'R$ 249,99 (promocional R$ 190,00)' },
  { slug: 'protocolo-pele-de-porcelana', nome: 'Protocolo Pele de Porcelana', product_id: 368600345, variant_id: 1600728698, precoReferencia: 'R$ 420,00' },
  { slug: 'gloss-labial-15g', nome: 'Gloss Labial 15g', product_id: 368602255, variant_id: 1600735231, precoReferencia: 'R$ 25,00' },
  { slug: 'creme-clareador-60g', nome: 'Creme Clareador 60g', product_id: 368602475, variant_id: 1600735743, precoReferencia: 'R$ 120,00' },
  { slug: 'protocolo-peeling-clareador', nome: 'Protocolo Peeling Clareador', product_id: 368602511, variant_id: 1600735880, precoReferencia: 'R$ 799,00' }
];

// Alias do título atual no Supabase ("Sérum Antioxidante Clareador", id 1),
// que gera o slug "serum-antioxidante-clareador(-1)" e não existe no catálogo.
// Aponta para o correspondente "serum-antioxidante-dermana" (mesmo produto, R$ 85).
// Se o título no admin for corrigido para "Serum Antioxidante DermAna", o alias deixa de ser usado.
var ALIAS_SLUG = {
  'serum-antioxidante-clareador': 'serum-antioxidante-dermana'
};

// Ligação POR ID do Supabase (não por título) — confirmada com o dono:
//   Supabase id 6 ("Sérum Dermocosmético Clareador", R$ 249,99) -> renova-skin (R$ 249,99)
//   Supabase id 7 ("Sabonete Renovador", R$ 85,00) -> sabonete-renovador-dermana (R$ 85,00)
// Produto do admin sem entrada aqui e sem slug correspondente = sem variant_id
// = indisponível para compra online (o backend rejeita, sem fallback).
var SUPABASE_ID_MAP = {
  6: 'renova-skin',
  7: 'sabonete-renovador-dermana'
};

function slugSeguro(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

var porSlug = {};
var porVariant = {};
var porProduct = {};
CATALOGO.forEach(function (p) {
  porSlug[p.slug] = p;
  porVariant[p.variant_id] = p;
  porProduct[p.product_id] = p;
});

function resolver(item) {
  item = item || {};
  // SEGURANÇA: nunca aceita preço, nome, variant_id nem product_id vindos do front.
  // Só slug do catálogo (ou slug do site com sufixo "-<id>") e id do Supabase.
  // 1) id do Supabase (ligação por ID, não por título)
  var sid = item.supabaseId != null ? item.supabaseId : item.supabase_id;
  if (sid != null && SUPABASE_ID_MAP[sid] && porSlug[SUPABASE_ID_MAP[sid]]) {
    return porSlug[SUPABASE_ID_MAP[sid]];
  }
  // 2) slug (tolerante ao sufixo "-<id>" que o front gera: "creme-clareador-60g-3")
  var raw = slugSeguro(item.slug);
  if (!raw) return null;
  if (porSlug[raw]) return porSlug[raw];
  var semSufixo = raw.replace(/-\d+$/, '');
  if (semSufixo && porSlug[semSufixo]) return porSlug[semSufixo];
  // 3) alias de título divergente do Supabase
  var alvo = ALIAS_SLUG[raw] || ALIAS_SLUG[semSufixo];
  if (alvo && porSlug[alvo]) return porSlug[alvo];
  return null;
}

module.exports = {
  CATALOGO: CATALOGO,
  ALIAS_SLUG: ALIAS_SLUG,
  SUPABASE_ID_MAP: SUPABASE_ID_MAP,
  porSlug: porSlug,
  porVariant: porVariant,
  porProduct: porProduct,
  resolver: resolver,
  slugSeguro: slugSeguro
};
