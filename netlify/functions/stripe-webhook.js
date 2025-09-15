// netlify/functions/stripe-webhook.js
import Stripe from 'stripe';
import fs from 'node:fs';
import path from 'node:path';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// archivo local para "pagados" en dev
const PAID_PATH = path.join(
  process.cwd(),
  'netlify',
  'functions',
  'data',
  'paid.json'
);

function readPaid() {
  try {
    return JSON.parse(fs.readFileSync(PAID_PATH, 'utf8'));
  } catch {
    return [];
  }
}
function writePaid(list) {
  try {
    fs.writeFileSync(PAID_PATH, JSON.stringify(list, null, 2));
  } catch {}
}

export default async (req) => {
  let event;
  const sig = req.headers.get('stripe-signature');

  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // email puede venir en customer_details.email
    const email =
      session?.customer_details?.email || session?.metadata?.app_email || '';
    if (email) {
      const list = readPaid();
      if (!list.includes(email.toLowerCase())) {
        list.push(email.toLowerCase());
        writePaid(list);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
