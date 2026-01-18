import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
  apiVersion: '2023-10-16' as any 
});
const router = express.Router();

// 🎟️ THE ACCESS REGISTRY: Hard-coded with your Stripe Price IDs
const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd', // 24H PASS
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7', // 7D SPRINT
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'  // 30D FORGE
};

router.post('/create-session', async (req, res) => {
  const { tier, userId } = req.body;

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
      // Ensure FRONTEND_URL in Render is set to https://www.janusforge.ai
      success_url: `${process.env.FRONTEND_URL}/nexus?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/nexus`,
      metadata: { 
        userId: userId, 
        tier: tier 
      }
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("❌ STRIPE IGNITION FAULT:", error.message);
    res.status(500).json({ error: "Checkout link failed to generate." });
  }
});

export default router;
