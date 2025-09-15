// netlify/functions/create-checkout-session.js
// Creates a Stripe Checkout Session for one-time payment or subscription (choose mode)
// ENV needed: STRIPE_SECRET_KEY, PRICE_ID, SUCCESS_URL, CANCEL_URL
import Stripe from 'stripe';

export default async (req, context) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    const body = await req.json();
    const email = body.email;
    const priceId = process.env.PRICE_ID;
    const successUrl =
      process.env.SUCCESS_URL || `${new URL(req.url).origin}/?ok=1`;
    const cancelUrl = process.env.CANCEL_URL || `${new URL(req.url).origin}/`;

    if (!email) return new Response('Missing email', { status: 400 });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      payment_method_types: ['card'], // 👈 ambas
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    return new Response('Error: ' + err.message, { status: 500 });
  }
};
