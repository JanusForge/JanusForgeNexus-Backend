import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { 
  apiVersion: '2025-01-27' as any 
});
const router = express.Router();

router.post('/create-session', async (req, res) => {
  const { priceId, userId, hours } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      // 🔑 METADATA: This is the only way the webhook knows who paid and for how long
      metadata: { 
        userId: userId, 
        hours: hours.toString() 
      },
      success_url: `${process.env.FRONTEND_URL}/nexus?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/nexus?canceled=true`,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Session Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
