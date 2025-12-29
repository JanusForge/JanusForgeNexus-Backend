import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// --- 1. STRIPE WEBHOOK (MUST BE BEFORE express.json()) ---
// Stripe needs the RAW body to verify signatures
app.post('/api/v1/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, 
      sig!, 
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`❌ Webhook Signature Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const tokens = parseInt(session.metadata?.tokenAmount || '0');

    console.log(`💰 Stripe Success: Adding ${tokens} tokens to User ${userId}`);

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { 
          // Use purchased_tokens if you have that column, or token_balance
          token_balance: { increment: tokens } 
        }
      });
      console.log('✅ Nexus Database Updated via Webhook');
    } catch (dbErr) {
      console.error('❌ Webhook DB Update Failed:', dbErr);
    }
  }

  res.json({ received: true });
});

// --- 2. STANDARD MIDDLEWARE ---
const allowedOrigins = ['https://janusforge.ai', 'https://www.janusforge.ai', 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. REST API ROUTES ---

// NEW: Stripe Checkout Route
app.post('/api/v1/billing/checkout', async (req, res) => {
  const { priceId, userId, tokens, mode } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: mode || 'payment', // 'subscription' or 'payment'
      success_url: `${process.env.FRONTEND_URL}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/billing?canceled=true`,
      metadata: {
        userId,
        tokenAmount: tokens.toString()
      },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe Session Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', database: 'connected', stripe: 'initialized' });
});

// LOGIN ROUTE (Unchanged logic, kept for context)
app.post('/api/auth/login', async (req, res) => {
  const identifier = req.body?.username || req.body?.email || req.body?.identifier;
  console.log(` Nexus Auth Attempt: ${identifier}`);

  if (identifier === 'admin-access' || identifier === 'admin@janusforge.ai') {
    return res.json({
      user: {
        id: process.env.ADMIN_UUID || '550e8400-e29b-41d4-a716-446655440000',
        username: 'admin-access',
        token_balance: 999999,
        tier: 'enterprise'
      },
      token: 'admin-bypass-token'
    });
  }

  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ username: String(identifier) }, { email: String(identifier) }] }
    });
    if (!user) return res.status(404).json({ message: "Intelligence profile not found." });
    res.json({ user, token: 'mock-jwt-token' });
  } catch (error) {
    res.status(500).json({ message: "Nexus Core Auth Error" });
  }
});

// --- 4. SOCKET.IO LOGIC ---
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  transports: ['polling', 'websocket']
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

io.on('connection', (socket) => {
  console.log('🔌 Nexus Connection Established:', socket.id);

  socket.on('post:new', async (postData) => {
    const { userId, content, name } = postData;
    const ADMIN_UUID = process.env.ADMIN_UUID || '550e8400-e29b-41d4-a716-446655440000';
    const isAdmin = name === 'admin-access' || userId === ADMIN_UUID;

    try {
      if (!isAdmin) {
        const userRecord = await prisma.user.findUnique({ where: { id: userId } });
        if (!userRecord || (userRecord.token_balance || 0) <= 5) {
          socket.emit('error', { message: 'Insufficient tokens.' });
          return;
        }
      }

      io.emit('post:incoming', {
        id: `user-${Date.now()}`,
        sender: 'user',
        name: name || 'Guest',
        content,
        timestamp: new Date().toISOString()
      });

      let sharedContext = `The user asked: "${content}"`;

      const processCouncilor = async (modelName: string, avatar: string, text: string, cost: number = 1) => {
        if (!isAdmin) {
          try {
            await prisma.user.update({
              where: { id: userId },
              data: { token_balance: { decrement: cost } }
            });
          } catch (e) { console.error("Deduction failed:", e); }
        }

        io.emit('ai:response', {
          id: `ai-${modelName}-${Date.now()}`,
          sender: 'ai',
          name: `Councilor ${modelName}`,
          avatar,
          content: text,
          isVerdict: modelName === 'JANUS VERDICT'
        });
      };

      // --- COUNCIL SEQUENCE ---
      // (Gemini, Claude, DeepSeek, Grok, Janus logic remains same...)
      // ... [Kept for brevity, matches your existing logic]

      io.emit('ai:typing', { councilor: null });
    } catch (globalError) {
      console.error("Global Nexus Error:", globalError);
      socket.emit('error', { message: 'A global error occurred in the Nexus.' });
    }
  });

  socket.on('disconnect', () => { console.log('❌ Connection Terminated'); });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Nexus Backend Live on Port ${PORT}`));
