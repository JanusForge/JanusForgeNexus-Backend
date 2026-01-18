import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

// 🛠️ FINAL ALIGNMENT: Hard-coding the version returned by your specific Stripe account headers.
// This resolves the "2025-01-27" mismatch by forcing the SDK to use the stable Clover release.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // @ts-ignore - Using the specific clover version identified in your Render logs
  apiVersion: '2025-12-15.clover' 
});

const router = express.Router();

const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

router.post('/create-session', async (req, res) => {
  const { tier, userId } = req.body;

  console.log(`📡 FORCED HANDSHAKE: Initializing Live Session for [${tier}]`);

  if (!PRICE_IDS[tier]) {
    console.error(`❌ REGISTRY ERROR: Tier [${tier}] not recognized.`);
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
      // Ensure FRONTEND_URL is https://www.janusforge.ai
      success_url: `${process.env.FRONTEND_URL}/nexus?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/nexus/pricing?canceled=true`,
      metadata: { userId, tier }
    });

    console.log(`✅ SESSION CREATED: ${session.id}`);
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("❌ STRIPE CRITICAL FAILURE:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
