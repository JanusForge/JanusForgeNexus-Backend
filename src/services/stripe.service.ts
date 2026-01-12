import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',  // Current latest as of Jan 2026
});

export const createCheckoutSession = async (params: {
  priceId: string;
  userId: string;
  tokens: number;
  mode: 'subscription' | 'payment';
}) => {
  const { priceId, userId, tokens, mode } = params;

  return await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    // mode 'subscription' triggers recurring billing; 'payment' is for one-time
    mode: mode, 
    success_url: `${process.env.FRONTEND_URL}/billing?success=true`,
    cancel_url: `${process.env.FRONTEND_URL}/billing?canceled=true`,
    metadata: {
      userId: userId,
      tokenAmount: tokens.toString(),
      // Helps your webhook distinguish between a tier upgrade and a top-up
      purchaseType: mode === 'subscription' ? 'monthly_tier' : 'token_pack'
    },
  });
};
