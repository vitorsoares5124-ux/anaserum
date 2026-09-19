// Camada baixa para o Supabase (tabela produtos + bucket produtos).
// IMPORTANTE: a chave secreta nova ("sb_secret_...") vai APENAS no header "apikey"
// (nao usar Authorization Bearer com essas chaves).
const URL = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABELA = () => URL() + '/rest/v1/produtos';
const STORAGE = () => URL() + '/storage/v1/object/produtos';

function configurado() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function chamada(url, opcoes) {
  opcoes = opcoes || {};
  const headers = Object.assign({ apikey: KEY() }, opcoes.headers || {});
  const resp = await fetch(url, Object.assign({}, opcoes, { headers: headers }));
  const texto = await resp.text();
  if (!resp.ok) throw new Error(texto || ('HTTP ' + resp.status));
  try { return JSON.parse(texto); } catch { return texto; }
}

// ---- produtos ----
async function listarProdutos() {
  return chamada(TABELA() + '?select=*&order=criado_em.desc');
}

async function inserirProduto(produto) {
  return chamada(TABELA(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(produto)
  });
}

async function excluirProduto(id) {
  await chamada(TABELA() + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
}

// ---- fotos ----
async function uploadFoto(nomeArquivo, bytes, contentType) {
  await chamada(STORAGE() + '/' + nomeArquivo, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes
  });
  // URL publica (bucket produtos eh publico)
  return URL() + '/storage/v1/object/public/produtos/' + nomeArquivo;
}

async function apagarFoto(nomeArquivo) {
  try {
    await fetch(STORAGE() + '/' + nomeArquivo, { method: 'DELETE', headers: { apikey: KEY() } });
  } catch { /* nao critico */ }
}

module.exports = {
  configurado: configurado,
  listarProdutos: listarProdutos,
  inserirProduto: inserirProduto,
  excluirProduto: excluirProduto,
  uploadFoto: uploadFoto,
  apagarFoto: apagarFoto
};
