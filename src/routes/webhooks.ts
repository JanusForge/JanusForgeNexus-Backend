import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

// Initialize Stripe with the Temporal Anchor
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

const router = express.Router();

/**
 * 🛰️ THE WEBHOOK FULFILLMENT GATEWAY
 * Processes the raw signal from Stripe to grant user access.
 */
router.post('/', async (req: any, res) => {
  const sig = req.headers['stripe-signature'];
  
  // Use the rawBody captured by the server.ts middleware
  const payload = req.rawBody || req.body;

  let event: Stripe.Event;

  try {
    // 🛡️ AUTHENTICATION: Verifying the signal is genuinely from Stripe
    event = stripe.webhooks.constructEvent(
      payload, 
      sig!, 
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    console.log(`✅ [SIGNAL AUTHENTICATED]: ${event.type}`);
  } catch (err: any) {
    console.error(`❌ [SIGNATURE MISMATCH]: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the specific event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, hours, tier } = session.metadata || {};

    if (userId && hours) {
      console.log(`📡 [HANDSHAKE]: Fulfilling ${hours}H access for User ${userId}`);
      
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + parseInt(hours));

      try {
        await prisma.user.update({
          where: { id: userId },
          data: {
            access_expiry: expiryDate,
            is_sovereign: true,
            tier: tier || 'SOVEREIGN'
          }
        });
        console.log(`✅ [SOVEREIGNTY GRANTED]: Access valid until ${expiryDate.toISOString()}`);
      } catch (dbError) {
        console.error("❌ [DATABASE SYNC ERROR]:", dbError);
        return res.status(500).send("Internal Server Error");
      }
    }
  }

  // Acknowledge receipt to Stripe
  res.json({ received: true });
});

export default router;
