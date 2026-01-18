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

    console.log(`📡 [2026-BYPASS] Attempting Handshake. Tier: ${tier || 'NULL'}, UserID: ${userId || 'NULL'}`);

    if (!tier || !PRICE_IDS[tier]) {
      return res.status(400).json({ error: "Please select a valid access tier." });
    }

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('line_items[0][price]', String(PRICE_IDS[tier]));
    params.append('line_items[0][quantity]', '1');
    
    const frontendUrl = process.env.FRONTEND_URL || 'https://janusforge.ai';
    params.append('success_url', `${frontendUrl}/nexus?session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${frontendUrl}/nexus/pricing?canceled=true`);
    
    // 🛡️ THE GUARD: Every value is forced to a String to avoid .toString() crashes
    params.append('metadata[userId]', String(userId || 'anonymous_user'));
    params.append('metadata[tier]', String(tier));
    params.append('payment_method_types[0]', 'card');

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16' 
      },
      body: params
    });

    const session: any = await response.json();

    if (session.error) {
      console.error("❌ STRIPE REJECTION:", session.error.message);
      return res.status(400).json({ error: session.error.message });
    }

    console.log(`✅ [2026-BYPASS] SUCCESS: Session ${session.id} generated.`);
    res.json({ url: session.url });

  } catch (error: any) {
    console.error("❌ CRITICAL BACKEND ERROR:", error.stack || error.message);
    res.status(500).json({ error: "Neural link synchronization failed. Please refresh." });
  }
});

export default router;
