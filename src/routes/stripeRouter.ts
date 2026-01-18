import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

router.post('/create-session', async (req, res) => {
  try {
    const { tier, userId } = req.body;

    // 🛡️ GUARD 1: Type-safe validation (Prevents .toString() crashes)
    if (!tier || !PRICE_IDS[tier]) {
      return res.status(400).json({ error: "Invalid Access Tier selected." });
    }

    const priceId = PRICE_IDS[tier];
    const safeUserId = String(userId || 'guest');
    const frontendUrl = process.env.FRONTEND_URL || 'https://janusforge.ai';

    console.log(`📡 [2026-FORCE] Primitive Handshake starting for User: ${safeUserId}`);

    // 🛡️ GUARD 2: Manual URL Encoding (Avoids URLSearchParams object bugs)
    const bodyParams = [
      `mode=payment`,
      `success_url=${encodeURIComponent(`${frontendUrl}/nexus?session_id={CHECKOUT_SESSION_ID}`)}`,
      `cancel_url=${encodeURIComponent(`${frontendUrl}/nexus/pricing?canceled=true`)}`,
      `line_items[0][price]=${priceId}`,
      `line_items[0][quantity]=1`,
      `metadata[userId]=${safeUserId}`,
      `metadata[tier]=${String(tier)}`,
      `payment_method_types[0]=card`
    ].join('&');

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16' 
      },
      body: bodyParams
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error("❌ STRIPE REJECTION:", data.error?.message || 'API Error');
      return res.status(400).json({ error: data.error?.message });
    }

    console.log(`✅ [2026-FORCE] SUCCESS: Session ${data.id}`);
    res.json({ url: data.url });

  } catch (err: any) {
    // 🧱 THE ABSOLUTE BACKSTOP: No more 500s.
    console.error("❌ NEURAL LINK CRASH:", err.message);
    res.status(500).json({ error: "Temporal sync error. Please check your login status and retry." });
  }
});

export default router;
