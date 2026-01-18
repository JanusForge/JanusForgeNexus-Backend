import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

const PRICE_IDS: Record<string, string> = {
  '24H': 'price_1Sqe8rGg8RUnSFObq4cv8Mnd',
  '7D':  'price_1SqeAhGg8RUnSFObRUOFFNH7',
  '30D': 'price_1SqeCqGg8RUnSFObHN4ZMCqs'
};

router.post('/create-session', async (req, res) => {
  try {
    const { tier, userId } = req.body;

    // 🛡️ Guard 1: Immediate Validation
    if (!tier || !PRICE_IDS[tier]) {
      return res.status(400).json({ error: "Invalid Access Tier selected." });
    }

    const priceId = PRICE_IDS[tier];
    const safeUserId = String(userId || 'guest');
    const frontendUrl = process.env.FRONTEND_URL || 'https://janusforge.ai';

    console.log(`📡 [2026-FORCE] Handshake starting for User: ${safeUserId}`);

    // 🛡️ Guard 2: Manual Body Construction
    // We use a plain object and convert to string to avoid URLSearchParams 'toString' bugs
    const rawBody = new URLSearchParams();
    rawBody.append('mode', 'payment');
    rawBody.append('success_url', `${frontendUrl}/nexus?session_id={CHECKOUT_SESSION_ID}`);
    rawBody.append('cancel_url', `${frontendUrl}/nexus/pricing?canceled=true`);
    rawBody.append('line_items[0][price]', priceId);
    rawBody.append('line_items[0][quantity]', '1');
    rawBody.append('metadata[userId]', safeUserId);
    rawBody.append('metadata[tier]', String(tier));

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16' // 🔒 Hard-locking the version
      },
      body: rawBody.toString()
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error("❌ STRIPE REJECTION:", data.error?.message || 'Unknown API Error');
      return res.status(400).json({ error: data.error?.message || "Stripe rejected the handshake." });
    }

    console.log(`✅ [2026-FORCE] SUCCESS: Session ${data.id}`);
    res.json({ url: data.url });

  } catch (criticalError: any) {
    // 🧱 The Ultimate Safety Net
    console.error("❌ CRITICAL SYSTEM ERROR:", criticalError.message);
    res.status(500).json({ error: "The Nexus Neural Link is currently unstable. Please refresh." });
  }
});

export default router;
