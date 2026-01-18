import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

// 🛠️ INITIALIZATION: No version here; we will set it per-request to bypass the 2026 SDK logic.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const router = express.Router();

const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

router.post('/create-session', async (req, res) => {
  const { tier, userId } = req.body;

  console.log(`📡 [2026-FORCE] Handshake for Tier: ${tier}`);

  if (!PRICE_IDS[tier]) {
    return res.status(400).json({ error: "Access tier invalid." });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: PRICE_IDS[tier],
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/nexus?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/nexus/pricing?canceled=true`,
      metadata: { userId, tier }
    }, {
      // 🔒 THE MASTER KEY: This overrides the SDK's 2026 default.
      // We are forcing the most stable version recognized by your account.
      apiVersion: '2023-10-16' as any 
    });

    console.log(`✅ [2026-FORCE] SUCCESS: Session ${session.id}`);
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("❌ STRIPE VERSION FAILURE:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
