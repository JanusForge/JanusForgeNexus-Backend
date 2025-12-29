import express from 'express';
import { createCheckoutSession } from '../services/stripe.service';

const router = express.Router();

router.post('/checkout', async (req, res) => {
  try {
    const { priceId, userId, tokens, mode } = req.body;
    
    const session = await createCheckoutSession({
      priceId,
      userId,
      tokens: tokens || 0,
      mode: mode || 'payment'
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe Session Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
