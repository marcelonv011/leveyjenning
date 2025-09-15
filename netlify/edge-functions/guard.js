// netlify/edge-functions/guard.js
export default async (request, context) => {
  const url = new URL(request.url);
  if (url.pathname !== '/levey_jennings_v6.html') {
    return context.next();
  }

  const cookie = request.headers.get('cookie') || '';
  const secret = Deno.env.get('SESSION_SECRET') || 'dev_secret_change_me';

  // Helpers
  const validHmac = async (data, sig) => {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const expectedBuf = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(data)
    );
    const expected = btoa(String.fromCharCode(...new Uint8Array(expectedBuf)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return sig === expected;
  };
  const parsePayload = (data) => {
    try {
      return JSON.parse(atob(data.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
      return {};
    }
  };

  // 1) Sesión obligatoria
  const mSess = cookie.match(/(?:^|;\s*)lj_session=([^;]+)/);
  if (!mSess) return Response.redirect(new URL('/index.html', url), 302);
  const [sessData, sessSig] = mSess[1].split('.');
  if (!sessData || !sessSig || !(await validHmac(sessData, sessSig))) {
    return Response.redirect(new URL('/index.html', url), 302);
  }
  const sess = parsePayload(sessData);
  if (!sess.exp || Date.now() > sess.exp) {
    return Response.redirect(new URL('/index.html', url), 302);
  }

  // 2) Si es FREE → acceso ilimitado
  if (sess.status === 'free') {
    return context.next();
  }

  // 3) Si es PAID → controla y aumenta contador (máx 3)
  if (sess.status === 'paid') {
    const mPaid = cookie.match(/(?:^|;\s*)lj_paid=([^;]+)/);
    let n = 0,
      exp = Date.now() + 90 * 24 * 60 * 60 * 1000; // default 90 días
    if (mPaid) {
      const [pData, pSig] = mPaid[1].split('.');
      if (pData && pSig && (await validHmac(pData, pSig))) {
        const p = parsePayload(pData);
        if (p && p.exp) exp = p.exp;
        n = typeof p.n === 'number' ? p.n : 0;
      }
    }

    // Si ya consumió 3 ingresos → bloquear
    if (n >= 3) {
      return Response.redirect(new URL('/index.html', url), 302);
    }

    // Incrementa y deja pasar
    const email = (sess.email || '').toLowerCase();
    const newPayload = { email, n: n + 1, exp };
    const newData = btoa(JSON.stringify(newPayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    // firmar con HMAC (igual que arriba)
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(newData)
    );
    const newSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const resp = await context.next();
    // Set-Cookie (no podemos saber si es localhost aquí; Set-Cookie sin Secure funciona en ambos)
    resp.headers.append(
      'Set-Cookie',
      `lj_paid=${newData}.${newSig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(
        0,
        Math.floor((exp - Date.now()) / 1000)
      )}`
    );
    return resp;
  }

  // Cualquier otro status → bloquear
  return Response.redirect(new URL('/index.html', url), 302);
};
