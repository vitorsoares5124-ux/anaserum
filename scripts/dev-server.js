// Servidor local DermAna - site estatico + painel /admin + API de produtos
// Se SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estiverem no .env, usa o Supabase.
// Caso contrario, cai na base local: data/produtos.json (fotos em uploads/).
// ATENCAO: este arquivo e APENAS para desenvolvimento local (node scripts/dev-server.js).
// Na Vercel, as rotas ficam em /api/*.js — este arquivo nao entra no deploy como funcao.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3100;

// ---- .env manual (sem dependencias) ----
(function carregarEnv() {
  const arq = path.join(ROOT, '.env');
  if (!fs.existsSync(arq)) return;
  fs.readFileSync(arq, 'utf8').split(/\r?\n/).forEach(function (linha) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  });
})();

const supa = require('../lib/supabase');
const handlers = require('../lib/handlers');
const USANDO_SUPABASE = supa.configurado();

const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'produtos.json');

for (const d of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function lerJSON(arquivo, padrao) {
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); }
  catch { return padrao; }
}

function salvarJSONLocal(arquivo, dados) {
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), 'utf8');
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function lerCorpo(req, limite) {
  limite = limite || 20 * 1024 * 1024; // 20 MB (foto em base64)
  return new Promise(function (resolve, reject) {
    const partes = [];
    let total = 0;
    req.on('data', function (chunk) {
      total += chunk.length;
      if (total > limite) { reject(new Error('Payload muito grande')); req.destroy(); return; }
      partes.push(chunk);
    });
    req.on('end', function () { resolve(Buffer.concat(partes)); });
    req.on('error', reject);
  });
}

function nomeSeguro(nome) {
  return String(nome)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase().slice(0, 60) || 'produto';
}

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { pathname = url.pathname; }

  try {
    // ---- Rota do painel ----
    if (pathname === '/admin' || pathname === '/admin/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(path.join(ROOT, 'admin.html')));
      return;
    }

    // ---- API: listar produtos ----
    if (pathname === '/api/produtos' && req.method === 'GET') {
      try {
        const dados = USANDO_SUPABASE ? await handlers.listar() : lerJSON(DB_FILE, []);
        return json(res, 200, dados);
      } catch (err) { return json(res, 500, { erro: String(err.message || err) }); }
    }

    // ---- API: catalogo publico Nuvemshop (slugs + mapas, sem segredos) ----
    if (pathname === '/api/catalogo' && req.method === 'GET') {
      try {
        const catalogo = require('../lib/produtos-nuvemshop');
        return json(res, 200, {
          produtos: catalogo.CATALOGO.map(function (p) { return { slug: p.slug, nome: p.nome }; }),
          supabaseIdMap: catalogo.SUPABASE_ID_MAP,
          aliases: catalogo.ALIAS_SLUG
        });
      } catch (err) { return json(res, 500, { erro: String(err.message || err) }); }
    }

    // ---- API: cadastrar produto ----
    if (pathname === '/api/produtos' && req.method === 'POST') {
      const corpo = await lerCorpo(req);
      let dados;
      try { dados = JSON.parse(corpo.toString('utf8')); }
      catch { return json(res, 400, { erro: 'JSON invalido' }); }

      if (USANDO_SUPABASE) {
        const r = await handlers.criar(dados);
        return json(res, r.status, r.dados);
      }

      // - fallback local (base JSON + uploads/) -
      const titulo = (dados.titulo || '').trim();
      const descricao = (dados.descricao || '').trim();
      const preco = (dados.preco || '').toString().trim();
      const pagamento = dados.pagamento || {};
      const foto = dados.foto;
      let parcQtd = 6;
      let parcValor = '';
      if (dados.parcelas && typeof dados.parcelas === 'object') {
        parcQtd = parseInt(dados.parcelas.qtd, 10) || 6;
        parcValor = String(dados.parcelas.valor || '').trim();
      } else if (dados.parcelas != null) {
        parcQtd = parseInt(dados.parcelas, 10) || 6;
      }
      if (parcQtd < 1) parcQtd = 1;
      if (parcQtd > 12) parcQtd = 12;
      if (parcQtd > 1 && !parcValor) {
        const txt = String(preco).trim();
        const n = txt.indexOf(',') >= 0 ? txt.replace(/\./g, '').replace(',', '.') : txt;
        const num = parseFloat(String(n).replace(/[^0-9.]/g, '')) || 0;
        if (num > 0) parcValor = (num / parcQtd).toFixed(2).replace('.', ',');
      }
      if (parcQtd <= 1) parcValor = '';

      if (!titulo) return json(res, 400, { erro: 'Titulo obrigatorio' });
      if (!preco) return json(res, 400, { erro: 'Preco obrigatorio' });
      if (!['whatsapp', 'link'].includes(pagamento.tipo)) {
        return json(res, 400, { erro: 'Escolha o tipo de pagamento: whatsapp ou link' });
      }
      if (pagamento.tipo === 'whatsapp') {
        const num = (pagamento.numero || '').replace(/\D/g, '');
        if (num.length < 10) return json(res, 400, { erro: 'Numero de WhatsApp invalido (use DDD + numero)' });
        pagamento.numero = num;
      }
      if (pagamento.tipo === 'link') {
        const u = (pagamento.url || '').trim();
        if (!/^https?:\/\//i.test(u)) return json(res, 400, { erro: 'Link de pagamento deve comecar com http:// ou https://' });
        pagamento.url = u;
      }

      let fotoPath = null;
      if (typeof foto === 'string' && foto.indexOf('data:image/') === 0) {
        const m = foto.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/);
        if (m) {
          const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
          const buffer = Buffer.from(m[2], 'base64');
          const nomeArq = Date.now() + '-' + nomeSeguro(titulo) + '.' + ext;
          fs.writeFileSync(path.join(UPLOAD_DIR, nomeArq), buffer);
          fotoPath = '/uploads/' + nomeArq;
        }
      }

      const produtos = lerJSON(DB_FILE, []);
      const produto = {
        id: Date.now(),
        titulo: titulo,
        descricao: descricao,
        preco: preco,
        parcelas: { qtd: parcQtd, valor: parcValor },
        pagamento: pagamento,
        foto: fotoPath,
        criadoEm: new Date().toISOString()
      };
      produtos.push(produto);
      salvarJSONLocal(DB_FILE, produtos);
      return json(res, 201, produto);
    }

    // ---- API: excluir produto ----
    if (pathname === '/api/produtos/excluir' && req.method === 'POST') {
      const corpo = await lerCorpo(req);
      let dados;
      try { dados = JSON.parse(corpo.toString('utf8')); }
      catch { return json(res, 400, { erro: 'JSON invalido' }); }

      if (USANDO_SUPABASE) {
        const r = await handlers.excluir(dados.id);
        return json(res, r.status, r.dados);
      }

      const id = Number(dados.id);
      const produtos = lerJSON(DB_FILE, []);
      const alvo = produtos.find(function (p) { return p.id === id; });
      if (!alvo) return json(res, 404, { erro: 'Produto nao encontrado' });
      if (alvo.foto && alvo.foto.indexOf('/uploads/') === 0) {
        const arq = path.join(UPLOAD_DIR, path.basename(alvo.foto));
        if (fs.existsSync(arq)) fs.unlinkSync(arq);
      }
      salvarJSONLocal(DB_FILE, produtos.filter(function (p) { return p.id !== id; }));
      return json(res, 200, { ok: true });
    }

    // ---- Vercel compatibility local: /api/produtos-excluir ----
    if (pathname === '/api/produtos-excluir' && req.method === 'POST') {
      const corpo = await lerCorpo(req);
      let dados;
      try { dados = JSON.parse(corpo.toString('utf8')); }
      catch { return json(res, 400, { erro: 'JSON invalido' }); }
      if (USANDO_SUPABASE) {
        const r = await handlers.excluir(dados.id);
        return json(res, r.status, r.dados);
      }
      return json(res, 404, { erro: 'Use /api/produtos/excluir' });
    }

    // ---- Arquivos estaticos ----
    if (req.method !== 'GET') return json(res, 405, { erro: 'Metodo nao permitido' });

    let rel = pathname === '/' ? '/index.html' : pathname;
    let filePath = path.resolve(ROOT, '.' + rel);
    if (filePath.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end('Proibido'); }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nao encontrado');
  } catch (err) {
    json(res, 500, { erro: String((err && err.message) || err) });
  }
});

server.listen(PORT, function () {
  console.log('DermAna rodando:');
  console.log('  Site  : http://localhost:' + PORT);
  console.log('  Admin : http://localhost:' + PORT + '/admin');
  console.log('  Base  : ' + (USANDO_SUPABASE ? 'Supabase (nuvem)' : 'local em data/produtos.json'));
});
