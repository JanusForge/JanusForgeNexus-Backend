import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

// 🛠️ THE UNIVERSAL LOCK:
// We are forcing the library to use a version that exists globally.
// We also use 'as any' to prevent the SDK from complaining about the version string.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any, 
  typescript: true,
});

const router = express.Router();

const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

router.post('/create-session', async (req, res) => {
  const { tier, userId } = req.body;

  // Verify the payload is arriving
  console.log(`📡 NEURAL CHECK: Received tier [${tier}] for user [${userId}]`);

  if (!PRICE_IDS[tier]) {
    console.error(`❌ TIER MISSING: [${tier}] not found in PRICE_IDS registry.`);
    return res.status(400).json({ error: "Access tier not found." });
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

    console.log(`✅ STRIPE LINK GENERATED: ${session.id}`);
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("❌ STRIPE CRITICAL ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
