// netlify/functions/login.js
import crypto from 'node:crypto';

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function sign(data, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function makeCookie(
  name,
  value,
  { maxAge, secure, path = '/', httpOnly = true, sameSite = 'Lax' } = {}
) {
  const parts = [`${name}=${value}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
// parse cookies simple
function getCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : '';
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email')?.trim().toLowerCase();
    if (!email) return new Response('Missing email', { status: 400 });

    // Consulta tu función de entitlements
    const entURL = new URL('/.netlify/functions/entitlements', url);
    entURL.searchParams.set('email', email);
    const ent = await fetch(entURL, {
      headers: { 'Cache-Control': 'no-store' },
    });
    if (!ent.ok)
      return new Response('Entitlements check failed', { status: 502 });
    const { status } = await ent.json(); // "free" | "paid" | "none"

    const isLocal = new URL(req.url).hostname === 'localhost';
    const secret = process.env.SESSION_SECRET || 'dev_secret_change_me';

    // Crea sesión (incluye status en el payload)
    if (status === 'free' || status === 'paid') {
      const sessExpSec = 12 * 60 * 60; // 12 h
      const payload = { email, status, exp: Date.now() + sessExpSec * 1000 };
      const data = b64url(JSON.stringify(payload));
      const sig = sign(data, secret);
      const sessionToken = `${data}.${sig}`;

      const headers = new Headers();
      headers.append(
        'Set-Cookie',
        makeCookie('lj_session', sessionToken, {
          maxAge: sessExpSec,
          secure: !isLocal,
        })
      );

      // Si es pago, asegurá que exista lj_paid con n=0 (o mantené la existente)
      if (status === 'paid') {
        const existing = getCookie(req, 'lj_paid');
        let needInit = true;
        if (existing) {
          const [d, s] = existing.split('.');
          if (d && s && sign(d, secret) === s) {
            // si ya existe una con exp válida, no la reiniciamos (conservar n)
            try {
              const p = JSON.parse(
                Buffer.from(
                  d.replace(/-/g, '+').replace(/_/g, '/'),
                  'base64'
                ).toString('utf8')
              );
              if (p && p.exp && Date.now() < p.exp) needInit = false;
            } catch {}
          }
        }
        if (needInit) {
          const limitDays = 90; // ventana para consumir las 3 entradas (ajustable)
          const paidPayload = {
            email,
            n: 0,
            exp: Date.now() + limitDays * 24 * 60 * 60 * 1000,
          };
          const pd = b64url(JSON.stringify(paidPayload));
          const ps = sign(pd, secret);
          const paidToken = `${pd}.${ps}`;
          headers.append(
            'Set-Cookie',
            makeCookie('lj_paid', paidToken, {
              maxAge: limitDays * 24 * 60 * 60,
              secure: !isLocal,
            })
          );
        }
      }

      headers.set('Location', '/levey_jennings_v6.html');
      return new Response(null, { status: 302, headers });
    }

    // Sin acceso
    return new Response(null, {
      status: 302,
      headers: { Location: '/index.html' },
    });
  } catch (e) {
    return new Response('Error: ' + e.message, { status: 500 });
  }
};
