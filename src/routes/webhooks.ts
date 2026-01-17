import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27' as any
});

const router = express.Router();

// The path here is just '/stripe' because the base is /api/webhooks in server.ts
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error("❌ MISSING STRIPE SIGNATURE");
    return res.status(400).send('Webhook Error: Missing signature');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, // This is the raw buffer from express.raw()
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`❌ SIGNATURE VERIFICATION FAILED: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // --- 🚀 SOVEREIGNTY FULFILLMENT ---
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, hours } = session.metadata || {};

    if (userId && hours) {
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const now = new Date();
        const baseDate = (user?.access_expiry && new Date(user.access_expiry) > now) 
          ? new Date(user.access_expiry) 
          : now;

        const newExpiry = new Date(baseDate.getTime() + parseInt(hours) * 60 * 60 * 1000);

        await prisma.user.update({
          where: { id: userId },
          data: { 
            access_expiry: newExpiry,
            role: user?.role === 'ADMIN' ? 'ADMIN' : 'SOVEREIGN' 
          }
        });

        console.log(`✅ SOVEREIGNTY GRANTED: User ${userId} | +${hours} Hours`);
      } catch (dbErr) {
        console.error("❌ DATABASE UPDATE ERROR:", dbErr);
      }
    }
  }

  // Stripe requires a 200 response to acknowledge receipt
  res.json({ received: true });
});

export default router;
