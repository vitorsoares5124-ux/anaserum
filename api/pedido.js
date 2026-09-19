/* =====================================================================
   api/pedido-parte-a.js (cabeÃ§alho + responder + slug + email)
   =====================================================================
   POST /api/pedido - FINALIZACAO DERMANA (estilo iFood)
   ---------------------------------------------------------------------
   Recebe do carrinho do site (front):
     body: {
       nome: "Maria", sobrenome: "Silva", email: "maria@email.com",
       itens: [ { slug: "renova-skin", quantidade: 2 } ]
     }
   VALIDA TUDO NO SERVIDOR (nunca confia no front):
     - nome/sobrenome obrigatorios; email em formato valido.
     - itens: array nao vazio (<=30), cada um com slug CONHECIDO e
       quantidade inteira entre 1 e 20.
     - O PRECO NUNCA vem do front! O valor do pedido e definido pela
       Nuvemshop atraves do variant_id do produto real da loja.
   Cria draft_order na Nuvemshop e devolve { checkout_url, total }.
   ===================================================================== */

function responder(res, status, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status);
  res.end(JSON.stringify(obj));
}

function slugSeguro(nome) {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function emailValido(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
}
/* =====================================================================
   PARTE-B: mapa slug -> variant_id + validacao COMPLETA do pedido
   ===================================================================== */

var MAPA_SLUG_VARIANTE = {
  'renova-skin': 1392130929,
  'kit-dermana-diario': 1395798129,
  'sabonete-renovador-dermana': 1395799510,
  'serum-antioxidante-dermana': 1396333916
};

function validarPedido(corpo) {
  corpo = corpo || {};
  var erros = [];
  var resolvidos = [];
  var nome = String(corpo.nome || '').trim();
  var sobrenome = String(corpo.sobrenome || '').trim();
  var email = String(corpo.email || '').trim();
  var itens = Array.isArray(corpo.itens) ? corpo.itens.slice(0, 20) : [];

  if (!nome) erros.push('Informe seu nome');
  // sobrenome opcional para fluxo iFood (prompt só pede nome) - usa nome como fallback
  if (!sobrenome && nome) sobrenome = nome.split(' ').slice(-1)[0] || nome;
  if (!sobrenome) sobrenome = 'Dermana';
  if (!emailValido(email)) erros.push('Informe um e-mail valido');

  if (!itens.length) {
    erros.push('Seu carrinho esta vazio');
  } else {
    for (var i = 0; i < itens.length; i++) {
      var it = itens[i] || {};
      var slug = slugSeguro(it.slug);
      var qtd = Number(it.quantidade != null ? it.quantidade : it.quantity);
      var vid = MAPA_SLUG_VARIANTE[slug];
      if (!vid) { erros.push('Produto nao disponivel: ' + (slug || '(vazio)')); continue; }
      if (!Number.isInteger(qtd) || qtd < 1 || qtd > 20) { erros.push('Quantidade invalida em "' + slug + '" (use 1 a 20)'); continue; }
      resolvidos.push({ variant_id: vid, quantity: qtd });
    }
  }

  if (erros.length) return { erros: erros };
  if (!resolvidos.length) return { erros: ['Seu carrinho esta vazio'] };
  return {
    dados: { nome: nome, sobrenome: sobrenome, email: email, products: resolvidos }
  };
}

module.exports = { validar: validarPedido, MAPA_SLUG_VARIANTE: MAPA_SLUG_VARIANTE };
/* =====================================================================
   PARTE-C: criacao do DRAFT ORDER na Nuvemshop + ROTA (module.exports)
   ===================================================================== */

var baseNuvem = 'https://api.nuvemshop.com.br/v1/';

function montarDraft(pedido) {
  var products = pedido.products || [];
  if (!products.length) return { erros: ['Nenhum produto para enviar'] };
  return {
    products: products.map(function (p) {
      return { variant_id: p.variant_id, quantity: p.quantity };
    })
  };
}

function criarDraftOrder(pedido) {
  var store = process.env.NUVEMSHOP_STORE_ID || '';
  var token = process.env.NUVEMSHOP_ACCESS_TOKEN || '';
  var ua = process.env.NUVEMSHOP_USER_AGENT || 'DermanaSite/1.0 (carrinho)';

  if (!store || !token) {
    return Promise.resolve({ erros: ['Nuvemshop nao configurada (env NUVEMSHOP_STORE_ID/ACCESS_TOKEN)'] });
  }

  var corpo = montarDraft(pedido);
  return fetch(baseNuvem + store + '/draft_orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authentication': 'bearer ' + token,
      'User-Agent': ua
    },
    body: JSON.stringify(corpo)
  }).then(function (r) {
    return r.json().catch(function () { return null; }).then(function (dados) {
      if (!r.ok) {
        return { erros: ['Nuvemshop recusou (HTTP ' + r.status + ')', JSON.stringify(dados || {})] };
      }
      var url = dados && dados.checkout_url;
      if (!url) return { erros: ['Resposta sem checkout_url da Nuvemshop'] };
      return {
        checkout_url: url,
        order_id: dados.id,
        total: dados.total
      };
    });
  });
}

var rota = async function (req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erros: ['Metodo deve ser POST'] });

  var corpo = {};
  try { corpo = JSON.parse(req.body || '{}'); }
  catch (e) { return responder(res, 400, { erros: ['JSON invalido no corpo'] }); }

  var validado = validarPedido(corpo);
  if (validado.erros) return responder(res, 400, { erros: validado.erros });

  var draft = await criarDraftOrder(validado.dados);
  if (draft.erros) return responder(res, 502, { erros: draft.erros });

  responder(res, 200, {
    ok: true,
    checkout_url: draft.checkout_url,
    order_id: draft.order_id,
    total: draft.total
  });
};

module.exports = rota;
