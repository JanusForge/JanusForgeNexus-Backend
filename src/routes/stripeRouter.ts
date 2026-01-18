import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

router.post('/create-session', async (req, res) => {
  const { tier, userId } = req.body;

  console.log(`📡 [2026-BYPASS] Initiating Raw Handshake for Tier: ${tier}`);

  if (!PRICE_IDS[tier]) {
    return res.status(400).json({ error: "Access tier invalid." });
  }

  try {
    // Manual parameter construction for Stripe's x-www-form-urlencoded API
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('line_items[0][price]', PRICE_IDS[tier]);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', `${process.env.FRONTEND_URL}/nexus?session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${process.env.FRONTEND_URL}/nexus/pricing?canceled=true`);
    params.append('metadata[userId]', userId);
    params.append('metadata[tier]', tier);
    params.append('payment_method_types[0]', 'card');

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16' // 🔒 FORCED STABLE VERSION
      },
      body: params
    });

    const session: any = await response.json();

    if (session.error) {
      console.error("❌ STRIPE API REJECTED REQUEST:", session.error.message);
      return res.status(400).json({ error: session.error.message });
    }

    console.log(`✅ [2026-BYPASS] SUCCESS: Session ${session.id} generated.`);
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("❌ CRITICAL NETWORK ERROR:", error.message);
    res.status(500).json({ error: "Nexus payment gateway timed out." });
  }
});

export default router;
