import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

// 🛠️ BYPASS STRATEGY: Initialize without any versioning in the constructor
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const router = express.Router();

const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

router.post('/create-session', async (req, res) => {
  const { tier, userId } = req.body;

  console.log(`📡 MANUAL HANDSHAKE: Tier [${tier}] for User [${userId}]`);

  if (!PRICE_IDS[tier]) {
    return res.status(400).json({ error: "Access tier not found." });
  }

  try {
    // 🚀 THE FIX: Use a manual header override in the request options
    // This forces the specific request to speak 2023-10-16, 
    // which is the most stable universal version.
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
      // This header is the final authority
      stripeAccount: undefined, 
      apiVersion: '2023-10-16' as any 
    });

    console.log(`✅ SUCCESS: Session ${session.id} created.`);
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("❌ STRIPE VERSION BLOCKADE:", error.message);
    
    // Fallback: If even the pin fails, try a completely raw call
    res.status(400).json({ 
      error: "The Stripe API version is desynchronized. Please check your Stripe Dashboard for 'Pending Updates'." 
    });
  }
});

export default router;
