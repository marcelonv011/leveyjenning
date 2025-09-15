// netlify/functions/stripe-webhook.js
// Stripe Webhook: on checkout.session.completed, mark email as paid in memory (or Netlify KV)
// ENV needed: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
import Stripe from "stripe";

// Same in-memory store used by entitlements.js during warm runtime
const paidEmails = globalThis._paidEmails || new Set();
globalThis._paidEmails = paidEmails;

export default async (req, context) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    const sig = req.headers.get("stripe-signature");
    const rawBody = await req.text();
    const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_details?.email || session.customer_email;
      if (email) {
        paidEmails.add(email.toLowerCase().trim());
      }
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    return new Response("Webhook Error: " + err.message, { status: 400 });
  }
};