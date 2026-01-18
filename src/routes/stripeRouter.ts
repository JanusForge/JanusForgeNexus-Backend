import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

// 🎟️ THE ACCESS REGISTRY: Mapping tiers to your live Stripe Price IDs
const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

router.post('/create-session', async (req, res) => {
  const { tier, userId } = req.body;

  console.log(`📡 RAW BYPASS: Initializing Live Session for [${tier}]`);

  if (!PRICE_IDS[tier]) {
    return res.status(400).json({ error: "Access tier not found." });
  }

  try {
    // 🚀 THE MANUAL HANDSHAKE:
    // We use a raw fetch to Stripe's API to bypass the SDK's versioning logic entirely.
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16' // 🔒 FORCED STABLE VERSION
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'success_url': `${process.env.FRONTEND_URL}/nexus?session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': `${process.env.FRONTEND_URL}/nexus/pricing?canceled=true`,
        'line_items[0][price]': PRICE_IDS[tier],
        'line_items[0][quantity]': '1',
        'metadata[userId]': userId,
        'metadata[tier]': tier,
        'payment_method_types[0]': 'card'
      })
    });

    const session = await response.json();

    if (session.error) {
      console.error("❌ RAW STRIPE ERROR:", session.error.message);
      return res.status(400).json({ error: session.error.message });
    }

    console.log(`✅ RAW SUCCESS: Session ${session.id} created.`);
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("❌ CRITICAL NETWORK ERROR:", error.message);
    res.status(500).json({ error: "Nexus payment gateway timed out." });
  }
});

export default router;
