import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any
});

const router = express.Router();

// ⚡ CRITICAL: Use express.raw to keep the body in buffer format for signature verification
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`❌ Webhook Signature Verification Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, hours, tier } = session.metadata || {};

    if (userId && hours) {
      console.log(`⚡ FULFILLING ACCESS: User ${userId} for ${hours} hours.`);
      
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
        console.log(`✅ NEURAL LINK UPDATED: Access granted for ${userId} until ${expiryDate.toISOString()}`);
      } catch (dbError) {
        console.error("❌ DATABASE UPDATE FAILED:", dbError);
      }
    }
  }

  res.json({ received: true });
});

export default router;
