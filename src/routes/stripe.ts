import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

// 🛠️ Temporal Lock: Explicitly setting the API version for the 2026 timeline
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27' as any
});

const router = express.Router();

const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

const HOURS_MAP: Record<string, number> = {
  '24H': 24,
  '7D': 168,
  '30D': 720
};

router.post('/create-session', async (req, res) => {
  const { tier, userId } = req.body;

  console.log(`📡 [2026-FORCE] Handshake Initialized. Tier: ${tier}, User: ${userId}`);

  try {
    // 🛡️ Guard: Ensure data exists before calling .toString()
    if (!tier || !PRICE_IDS[tier]) {
      return res.status(400).json({ error: "Invalid Access Tier selected." });
    }

    const priceId = PRICE_IDS[tier];
    const hours = HOURS_MAP[tier];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      // 🔑 METADATA: Fulfillment logic for the Webhook
      metadata: {
        userId: String(userId || 'anonymous'),
        tier: String(tier),
        hours: String(hours) 
      },
      success_url: `${process.env.FRONTEND_URL}/nexus?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?canceled=true`,
    });

    console.log(`✅ [2026-FORCE] SUCCESS: Session ${session.id} generated.`);
    res.json({ url: session.url });

  } catch (error: any) {
    console.error("❌ STRIPE CRITICAL FAILURE:", error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
