import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

// 🛠️ ULTIMATE FIX: Explicitly setting apiVersion to null or a known stable version
// to override any hidden environment defaults causing the 2025-01-27 error.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // @ts-ignore - Forcing Stripe to use the account-set default version
  apiVersion: null 
});

const router = express.Router();

const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

router.post('/create-session', async (req, res) => {
  const { tier, userId } = req.body;

  console.log(`📡 NEURAL HANDSHAKE: Attempting Stripe Session for [${tier}]`);

  if (!PRICE_IDS[tier]) {
    return res.status(400).json({ error: "Access tier not found in registry." });
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
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("❌ STRIPE CRITICAL ERROR:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
