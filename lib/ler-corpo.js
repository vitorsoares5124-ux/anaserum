// Leitura robusta do corpo da requisição (Vercel + dev-server local).
// Na Vercel (funções Node), req.body já vem parseado (objeto) quando o
// Content-Type é application/json — ler o stream ali falha porque ele já
// foi consumido. Em servidores tradicionais, req.body é undefined e o
// stream precisa ser lido.
//   - objeto (não nulo) -> usa direto;
//   - string -> JSON.parse em try/catch;
//   - undefined -> lê o stream (só se req.on existir).
// Erro de parse: rejeita com Error('JSON invalido no corpo').
function lerCorpo(req) {
  var b = req ? req.body : undefined;
  if (b != null && typeof b === 'object') return Promise.resolve(b);
  if (typeof b === 'string') {
    var txt = b.trim();
    if (!txt) return Promise.resolve({});
    try {
      return Promise.resolve(JSON.parse(txt));
    } catch (e) {
      return Promise.reject(new Error('JSON invalido no corpo'));
    }
  }
  if (!req || typeof req.on !== 'function') return Promise.resolve({});
  return new Promise(function (resolve, reject) {
    var partes = [];
    var total = 0;
    var finalizado = false;
    function falhar(msg) {
      if (finalizado) return;
      finalizado = true;
      reject(new Error(msg));
    }
    req.on('data', function (chunk) {
      total += chunk.length;
      if (total > 5 * 1024 * 1024) {
        falhar('Payload muito grande');
        try { req.destroy(); } catch (e) {}
        return;
      }
      partes.push(chunk);
    });
    req.on('end', function () {
      if (finalizado) return;
      finalizado = true;
      var buf = partes.map(function (c) { return Buffer.isBuffer(c) ? c : Buffer.from(String(c)); });
      var texto = Buffer.concat(buf).toString('utf8').trim();
      if (!texto) return resolve({});
      try {
        resolve(JSON.parse(texto));
      } catch (e) {
        reject(new Error('JSON invalido no corpo'));
      }
    });
    req.on('error', function () { falhar('JSON invalido no corpo'); });
  });
}

module.exports = { lerCorpo: lerCorpo };
