import express from 'express';
import Stripe from 'stripe';

// Anchor to 2023 version to bypass the 2026 SDK default logic
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any 
});

const router = express.Router();

const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

const HOURS_MAP: Record<string, number> = {
  '24H': 24,
  '7D': 168,
  '30D': 720
};

router.post('/create-session', async (req, res) => {
  const { tier, userId } = req.body;

  console.log(`📡 [2026-ANCHOR] Initializing for User: ${userId}`);

  try {
    if (!tier || !PRICE_IDS[tier]) {
      return res.status(400).json({ error: "Invalid Access Tier." });
    }

    const priceId = PRICE_IDS[tier];
    const hours = HOURS_MAP[tier];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      metadata: {
        userId: String(userId || 'anonymous'),
        tier: String(tier),
        hours: String(hours)
      },
      // 🔒 HARD-LOCKED HTTPS SCHEME: 
      // This bypasses any misconfigured FRONTEND_URL env variables
      success_url: `https://janusforge.ai/nexus?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://janusforge.ai/pricing?canceled=true`,
    });

    console.log(`✅ [2026-ANCHOR] Handshake Successful: ${session.id}`);
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("❌ STRIPE REDIRECT ERROR:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
