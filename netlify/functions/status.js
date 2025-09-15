// netlify/functions/status.js
// Retorna o estado da sessão e o contador de entradas (para plano pago).
// Nunca responde 500: em erro, devolve { status:"none" }.

import crypto from 'node:crypto';

const getEnv = (k) =>
  typeof Deno !== 'undefined' && Deno.env?.get
    ? Deno.env.get(k)
    : process.env[k];

function b64urlToBuf(s) {
  // base64url -> base64
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}
function safeJSON(buf) {
  try {
    return JSON.parse(
      Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf)
    );
  } catch {
    return {};
  }
}
function sign(data, secret) {
  // HMAC-SHA256 em base64url, igual login.js
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function json(obj, code = 200) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export default async (req) => {
  try {
    const secret = getEnv('SESSION_SECRET') || 'dev_secret_change_me';
    const cookie = req.headers.get('cookie') || '';

    const getCookie = (name) => {
      const m = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
      return m ? m[1] : '';
    };

    // 1) Sessão obrigatória
    const sessTok = getCookie('lj_session');
    if (!sessTok) return json({ status: 'none' });

    const [sData, sSig] = sessTok.split('.');
    if (!sData || !sSig || sign(sData, secret) !== sSig)
      return json({ status: 'none' });

    const sess = safeJSON(b64urlToBuf(sData));
    if (!sess.exp || Date.now() > sess.exp) return json({ status: 'none' });

    // 2) Se for FREE → ilimitado
    if (sess.status === 'free') {
      return json({
        status: 'free',
        plan: 'free',
        used: 0,
        remaining: null,
        limit: null,
      });
    }

    // 3) Se for PAID → ler contador
    if (sess.status === 'paid') {
      const pTok = getCookie('lj_paid');
      let used = 0,
        limit = 3,
        remaining = 3;

      if (pTok) {
        const [pData, pSig] = pTok.split('.');
        if (pData && pSig && sign(pData, secret) === pSig) {
          const p = safeJSON(b64urlToBuf(pData));
          if (p && typeof p.n === 'number') {
            used = p.n;
            remaining = Math.max(0, limit - used);
          }
        }
      }
      return json({ status: 'paid', plan: 'paid', used, remaining, limit });
    }

    // Outros estados
    return json({ status: 'none' });
  } catch {
    return json({ status: 'none' });
  }
};
