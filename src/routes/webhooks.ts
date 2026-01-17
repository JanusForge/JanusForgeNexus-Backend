import express from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
const router = express.Router();

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']!;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, hours } = session.metadata!;

    // ⏳ Calculate New Expiry
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const currentExpiry = user?.access_expiry && user.access_expiry > new Date() 
      ? new Date(user.access_expiry) 
      : new Date();

    const newExpiry = new Date(currentExpiry.getTime() + parseInt(hours) * 60 * 60 * 1000);

    // 💾 Update Prisma
    await prisma.user.update({
      where: { id: userId },
      data: { access_expiry: newExpiry, role: 'SOVEREIGN' }
    });
  }

  res.json({ received: true });
});

export default router;
