// Logica compartilhada de produtos (usada pelo server.js local e pelas rotas da Vercel)
const supa = require('./supabase');

// "Produto Teste!!!" -> "produto-teste"
function nomeSeguro(nome) {
  return String(nome).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || 'produto';
}

// Converte "data:image/png;base64,..." -> Buffer + extensao
function extrairDataUrl(foto) {
  if (typeof foto !== 'string' || foto.indexOf('data:image/') !== 0) return null;
  const m = foto.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/);
  if (!m) return null;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  return { extensao: ext, mime: 'image/' + ext, bytes: Buffer.from(m[2], 'base64') };
}

function precoParaNumero(s) {
  const txt = String(s == null ? '' : s).trim();
  if (!txt) return 0;
  const n = txt.indexOf(',') >= 0 ? txt.replace(/\./g, '').replace(',', '.') : txt;
  return parseFloat(String(n).replace(/[^0-9.]/g, '')) || 0;
}

function normalizarParcelas(corpo, precoStr) {
  let qtd = 6;
  let valor = '';
  const parc = corpo.parcelas;
  if (typeof parc === 'number' || typeof parc === 'string') {
    qtd = parseInt(parc, 10);
  } else if (parc && typeof parc === 'object') {
    qtd = parseInt(parc.qtd != null ? parc.qtd : parc.quantidade, 10);
    valor = String(parc.valor != null ? parc.valor : '').trim();
  }
  if (isNaN(qtd) || qtd < 1) qtd = 1;
  if (qtd > 12) qtd = 12;
  if (qtd > 1 && !valor) {
    const preco = precoParaNumero(precoStr);
    if (preco > 0) valor = (preco / qtd).toFixed(2).replace('.', ',');
  }
  if (qtd <= 1) valor = '';
  return { qtd: qtd, valor: valor };
}

function validar(corpo) {
  const titulo = String(corpo.titulo || '').trim();
  const descricao = String(corpo.descricao || '').trim();
  const preco = String(corpo.preco != null ? corpo.preco : '').trim();
  const pag = (typeof corpo.pagamento === 'object' && corpo.pagamento) ? corpo.pagamento : {};
  const parcelas = normalizarParcelas(corpo, preco);

  if (!titulo) return { erro: 'Titulo obrigatorio' };
  if (!preco) return { erro: 'Preco obrigatorio' };
  if (['whatsapp', 'link'].indexOf(pag.tipo) < 0) {
    return { erro: 'Escolha o tipo de pagamento: whatsapp ou link' };
  }
  if (pag.tipo === 'whatsapp') {
    const num = String(pag.numero || '').replace(/\D/g, '');
    if (num.length < 10) return { erro: 'Numero de WhatsApp invalido (use DDD + numero)' };
    pag.numero = num;
  } else {
    const u = String(pag.url || '').trim();
    if (!/^https?:\/\//i.test(u)) return { erro: 'Link de pagamento deve comecar com http:// ou https://' };
    pag.url = u;
  }
  return { dados: { titulo: titulo, descricao: descricao, preco: preco, parcelas: parcelas, pagamento: pag, foto: corpo.foto } };
}

function parcelasDaLinha(p) {
  // Suporta colunas novas (parcelas, parcela_valor) e fallback para produtos antigos (6x calculado)
  let qtd = parseInt(p.parcelas != null ? p.parcelas : 6, 10);
  if (isNaN(qtd) || qtd < 1) qtd = 6;
  if (qtd > 12) qtd = 12;
  let valor = p.parcela_valor != null ? String(p.parcela_valor).trim() : '';
  if (qtd > 1 && !valor) {
    const preco = precoParaNumero(p.preco);
    if (preco > 0) valor = (preco / qtd).toFixed(2).replace('.', ',');
  }
  if (qtd <= 1) valor = '';
  return { qtd: qtd, valor: valor };
}

async function listar() {
  const produtos = await supa.listarProdutos();
  // devolve no formato que o admin ja mostra
  return produtos.map(function (p) {
    return {
      id: p.id,
      titulo: p.titulo,
      descricao: p.descricao || '',
      preco: p.preco,
      parcelas: parcelasDaLinha(p),
      pagamento: { tipo: p.pag_tipo, numero: p.whatsapp_numero || undefined, url: p.link_url || undefined },
      foto: p.foto_url || null,
      criadoEm: p.criado_em
    };
  });
}

async function criar(corpo) {
  const v = validar(corpo);
  if (v.erro) return { status: 400, dados: { erro: v.erro } };
  const d = v.dados;

  // sobe foto se houver
  let fotoUrl = null;
  const arq = extrairDataUrl(d.foto);
  if (arq) {
    const arquivo = Date.now() + '-' + nomeSeguro(d.titulo) + '.' + arq.extensao;
    fotoUrl = await supa.uploadFoto(arquivo, arq.bytes, arq.mime);
  }

  // Tenta salvar com colunas novas; se o banco ainda não tem a migração, faz fallback sem elas
  let inseridos;
  const base = {
    titulo: d.titulo,
    descricao: d.descricao,
    preco: d.preco,
    pag_tipo: d.pagamento.tipo,
    whatsapp_numero: d.pagamento.tipo === 'whatsapp' ? d.pagamento.numero : null,
    link_url: d.pagamento.tipo === 'link' ? d.pagamento.url : null,
    foto_url: fotoUrl
  };
  try {
    inseridos = await supa.inserirProduto(Object.assign({}, base, {
      parcelas: d.parcelas.qtd,
      parcela_valor: d.parcelas.valor || null
    }));
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/parcelas?|parcela_valor|column|schema cache/i.test(msg)) {
      inseridos = await supa.inserirProduto(base);
    } else {
      throw e;
    }
  }
  const p = inseridos[0];
  return {
    status: 201,
    dados: {
      id: p.id,
      titulo: p.titulo,
      descricao: p.descricao,
      preco: p.preco,
      parcelas: (p.parcelas != null || p.parcela_valor != null) ? parcelasDaLinha(p) : d.parcelas,
      pagamento: { tipo: p.pag_tipo, numero: p.whatsapp_numero || undefined, url: p.link_url || undefined },
      foto: p.foto_url || null,
      criadoEm: p.criado_em
    }
  };
}

async function excluir(id) {
  const achados = await supa.listarProdutos();
  const alvo = achados.find(function (p) { return String(p.id) === String(id); });
  if (!alvo) return { status: 404, dados: { erro: 'Produto nao encontrado' } };
  if (alvo.foto_url) {
    const nome = alvo.foto_url.split('/').pop();
    await supa.apagarFoto(nome);
  }
  await supa.excluirProduto(alvo.id);
  return { status: 200, dados: { ok: true } };
}

module.exports = { listar: listar, criar: criar, excluir: excluir };
