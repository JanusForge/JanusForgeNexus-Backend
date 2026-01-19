import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

// Initialize Stripe with the Temporal Anchor (2023 version)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

const router = express.Router();

/**
 * 🛰️ THE NEURAL FULFILLMENT GATEWAY
 * This endpoint processes confirmed signals from Stripe.
 * Important: The 'req.body' here must be the Raw Buffer provided 
 * by the middleware in server.ts.
 */
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;

  try {
    // 🛡️ VERIFICATION: Ensuring the payload is authentic and untampered
    event = stripe.webhooks.constructEvent(
      req.body, // This is the Raw Buffer
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    console.log(`✅ [SIGNAL VERIFIED]: ${event.type}`);
  } catch (err: any) {
    console.error(`❌ [SIGNATURE FAILURE]: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ⚡ HANDLE SUCCESSFUL PAYMENT
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    
    // Extract metadata we injected during session creation
    const { userId, hours, tier } = session.metadata || {};

    if (userId && hours) {
      console.log(`📡 [FULFILLMENT START]: Granting ${hours}H access to User ${userId}`);
      
      // Calculate Expiry: Current Time + Purchased Hours
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + parseInt(hours));

      try {
        // 🏛️ PRISMA UPDATE: Writing the Sovereign status to the database
        await prisma.user.update({
          where: { id: userId },
          data: {
            access_expiry: expiryDate,
            is_sovereign: true,
            tier: tier || 'SOVEREIGN'
          }
        });
        
        console.log(`✅ [NEURAL LINK RESTORED]: User ${userId} is now SOVEREIGN until ${expiryDate.toISOString()}`);
      } catch (dbError) {
        console.error("❌ [DATABASE CRITICAL FAILURE]:", dbError);
        return res.status(500).json({ error: "Database synchronization failed" });
      }
    } else {
      console.warn("⚠️ [DATA MISMATCH]: Webhook received but metadata (userId/hours) is missing.");
    }
  }

  // Acknowledge receipt to Stripe
  res.json({ received: true });
});

export default router;
