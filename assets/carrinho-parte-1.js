/* =====================================================================
   PARTE-1: estado do carrinho (localStorage) + badge + APIs publicas
   ===================================================================== */
(function () {
  var CHAVE = "dermana-carrinho";
  var estado = [];
  var ouvinte = null;

  function atualizarBadges() {
    var badges = document.querySelectorAll(".pmodal__badge, .cart-trigger__badge");
    var n = estado.reduce(function (t, it) { return t + (it.quantidade || 0); }, 0);
    badges.forEach(function (b) {
      b.textContent = n;
      b.classList.toggle("is-visible", n > 0);
    });
  }

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) {}
    atualizarBadges();
    if (ouvinte) ouvinte();
  }
  function carregar() {
    try {
      var t = JSON.parse(localStorage.getItem(CHAVE) || "[]");
      estado = Array.isArray(t) ? t : [];
    } catch (e) { estado = []; }
  }

  var api = window.DermanaCarrinho = {};

  api.adicionar = function (slug, nome, preco, extra) {
    carregar();
    extra = extra || {};
    var qtdAdd = parseInt(extra.quantidade, 10);
    if (!qtdAdd || qtdAdd < 1) qtdAdd = 1;
    if (qtdAdd > 20) qtdAdd = 20;
    var achou = estado.filter(function (it) { return it.slug === slug; })[0];
    if (achou) achou.quantidade += qtdAdd;
    else estado.push({ slug: slug, nome: nome || slug, preco: Number(preco) || 0, quantidade: qtdAdd, pag_tipo: extra.pag_tipo || null, pag_valor: extra.pag_valor || null, foto: extra.foto || null, descricao: extra.descricao || '' });
    // atualiza dados se vieram depois
    if (achou && extra.pag_tipo) { achou.pag_tipo = extra.pag_tipo; achou.pag_valor = extra.pag_valor; }
    salvar();
  };

  api.remover = function (slug) {
    carregar();
    estado = estado.filter(function (it) { return it.slug !== slug; });
    salvar();
  };

  api.alterarQuantidade = function (slug, delta) {
    carregar();
    var achou = estado.filter(function (it) { return it.slug === slug; })[0];
    if (!achou) return;
    achou.quantidade = (achou.quantidade || 1) + delta;
    if (achou.quantidade <= 0) {
      estado = estado.filter(function (it) { return it.slug !== slug; });
    }
    salvar();
  };

  api.total = function () {
    carregar();
    return estado.reduce(function (t, it) { return t + (it.preco || 0) * (it.quantidade || 0); }, 0);
  };

  api.itens = function () {
    carregar();
    return estado.slice();
  };

  api.aoMudar = function (fn) {
    ouvinte = fn;
    // dispara imediatamente para sincronizar drawer que pode ter carregado depois
    try { fn(); } catch (e) {}
  };

  carregar();
  salvar();

  // expõe evento para quem perdeu o timing do aoMudar (fix race com script defer)
  try { document.dispatchEvent(new CustomEvent('dermana:carrinho-pronto')); } catch (e) {}
})();
