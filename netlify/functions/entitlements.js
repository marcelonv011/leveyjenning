// netlify/functions/entitlements.js
import fs from 'node:fs';
import path from 'node:path';

const PAID_PATH = path.join(
  process.cwd(),
  'netlify',
  'functions',
  'data',
  'paid.json'
);

const getEnv = (k) =>
  typeof Deno !== 'undefined' && Deno.env?.get
    ? Deno.env.get(k)
    : process.env[k];

const parseList = (s) =>
  (s || '')
    .toLowerCase()
    .split(/[,\s;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });

export default async (req) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email')?.trim().toLowerCase();
    if (!email) return json({ status: 'none', reason: 'missing email' });

    // 1) listas por ENV
    const free = parseList(getEnv('FREE_EMAILS'));
    const forced = parseList(getEnv('FORCE_PAID_EMAILS'));

    if (free.includes(email)) return json({ status: 'free' });
    if (forced.includes(email)) return json({ status: 'paid' });

    // 2) archivo local (dev) escrito por el webhook
    try {
      const paidList = JSON.parse(fs.readFileSync(PAID_PATH, 'utf8'));
      if (Array.isArray(paidList) && paidList.includes(email)) {
        return json({ status: 'paid' });
      }
    } catch {}

    return json({ status: 'none' });
  } catch (e) {
    return json({ status: 'none', error: String(e?.message || e) });
  }
};
