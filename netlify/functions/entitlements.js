// netlify/functions/entitlements.js
// Returns {status: "free"|"paid"|"none"}
// Simple version: free via whitelist.json, paid emails stored in Netlify KV (or fallback to in-memory map)
import fs from "node:fs/promises";

// Use Netlify KV if available; fallback to in-memory (resets on cold start)
let paidEmails = new Set();

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get("email");
    if (!email) return new Response("Missing email", { status: 400 });

    // Check whitelist
    const raw = await fs.readFile("./whitelist.json", "utf-8");
    const whitelist = JSON.parse(raw).free_emails || [];
    if (whitelist.map(e => e.toLowerCase().trim()).includes(email.toLowerCase().trim())) {
      return Response.json({ status: "free" });
    }

    // Check paid (in-memory)
    if (paidEmails.has(email.toLowerCase().trim())) {
      return Response.json({ status: "paid" });
    }

    return Response.json({ status: "none" });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
};