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
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { TIER_CONFIGS } from './config/tiers';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

// --- AI CLIENTS ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

// --- THE COUNCIL ENGINE (EXPORTED FOR SCOUT) ---
// This resolves the SyntaxError by providing the named export the Scout script needs
export async function generateCouncilResponse(content: string, modelId: string) {
  try {
    if (modelId === 'deepseek') {
      const res = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: [{ role: "user", content }],
      });
      return res.choices[0].message.content || "";
    } 
    else if (modelId === 'gemini') {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const result = await model.generateContent(content);
      return result.response.text();
    }
    else if (modelId === 'grok') {
      const res = await xai.chat.completions.create({
        model: "grok-beta",
        messages: [{ role: "user", content }],
      });
      return res.choices[0].message.content || "";
    }
    else if (modelId === 'claude') {
      const res = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1024,
        messages: [{ role: "user", content }],
      });
      return res.content[0].type === 'text' ? res.content[0].text : "";
    }
    else if (modelId === 'gpt4') {
      const res = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [{ role: "user", content }],
      });
      return res.choices[0].message.content || "";
    }
    return "Council member silent.";
  } catch (err) {
    console.error(`❌ Engine error for ${modelId}:`, err);
    throw err;
  }
}

// --- EMAIL CONFIG ---
const transporter = nodemailer.createTransport({
  host: "mail.privateemail.com",
  port: 465,
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// --- AUDIT UTILITY ---
const sendAdminAuditEmail = async (session: Stripe.Checkout.Session, tokens: number, packageName: string) => {
  try {
    await transporter.sendMail({
      from: '"Nexus Audit" <welcome@janusforge.ai>',
      to: process.env.EMAIL_USER,
      subject: `💰 FORGE REFUEL: ${packageName} Acquired`,
      html: `
        <div style="font-family: sans-serif; background: #000; color: #fff; padding: 30px; border-radius: 15px; border: 1px solid #333;">
          <h2 style="color: #3b82f6; text-transform: uppercase;">Economic Influx</h2>
          <p><strong>Package:</strong> ${packageName} | <strong>Tokens:</strong> ${tokens}</p>
          <p><strong>Revenue:</strong> $${(session.amount_total || 0) / 100} | <strong>User:</strong> ${session.metadata?.userId}</p>
        </div>
      `,
    });
  } catch (error) { console.error('❌ Audit Failed:', error); }
};

// --- STRIPE WEBHOOK ---
app.post('/api/v1/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) { return res.status(400).send(`Webhook Error: ${err.message}`); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, tokenAmount, packageName } = session.metadata || {};
    const tokens = parseInt(tokenAmount || '0');

    try {
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { token_balance: { increment: tokens } } }),
        prisma.purchase.create({
          data: { userId: userId!, amount: (session.amount_total || 0) / 100, tokens, packageName: packageName || 'Fuel Pack', stripeSessionId: session.id }
        })
      ]);
      await sendAdminAuditEmail(session, tokens, packageName || 'Fuel Pack');
    } catch (dbErr) { console.error('❌ DB Update Failed:', dbErr); }
  }
  res.json({ received: true });
});

// --- MIDDLEWARE ---
const allowedOrigins = ['https://janusforge.ai', 'https://www.janusforge.ai', 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// --- REST API (Daily Forge & Billing) ---
app.get('/api/daily-forge', async (req, res) => {
  try {
    const forge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
    if (!forge) return res.status(404).json({ error: "No report." });
    res.json({ ...forge, scoutedTopics: JSON.parse(forge.scoutedTopics), councilVotes: JSON.parse(forge.councilVotes) });
  } catch (err) { res.status(500).json({ error: "Core Error" }); }
});

app.post('/api/v1/billing/checkout', async (req, res) => {
  const { priceId, userId, tokens, mode, packageName } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: mode || 'payment',
      success_url: `${process.env.FRONTEND_URL}/pricing/success`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?canceled=true`,
      metadata: { userId, tokenAmount: tokens.toString(), packageName: packageName || 'Fuel Pack' },
    });
    res.json({ url: session.url });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- SOCKET.IO: UNIVERSAL CORS & ARBITER ---
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      const allowedPatterns = [
        /^https:\/\/janusforge\.ai$/,
        /^https:\/\/www\.janusforge\.ai$/,
        /\.vercel\.app$/ 
      ];
      if (!origin || allowedPatterns.some(pattern => pattern.test(origin))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket']
});

io.on('connection', (socket) => {
  console.log('⚡ Nexus Connection Established');

  socket.on('post:new', async (postData) => {
    try {
      // 1. ARBITER: Validate User & Deduct Token
      const user = await prisma.user.findUnique({ where: { id: postData.userId } });
      if (!user || user.token_balance < 1) {
        socket.emit('error', { message: 'Insufficient tokens.' });
        return;
      }
      await prisma.user.update({ where: { id: postData.userId }, data: { token_balance: { decrement: 1 } } });

      // 2. PHASE SHIFT
      const forge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
      if (forge) await prisma.dailyForge.update({ where: { id: forge.id }, data: { phase: 'Architect_Interjection' } });

      // 3. BROADCAST: Architect Input
      io.emit('post:incoming', { id: crypto.randomUUID(), name: postData.name, content: postData.content, sender: 'user' });

      // 4. TIER-GUIDED SUMMONING
      const tier = (user.tier || 'free') as keyof typeof TIER_CONFIGS;
      const modelLimit = TIER_CONFIGS[tier]?.max_ai_models || 2;
      const masterCouncil = [
        { id: 'deepseek', name: 'DeepSeek (Logic)' },
        { id: 'gemini', name: 'Gemini (Observer)' },
        { id: 'grok', name: 'Grok (Catalyst)' },
        { id: 'claude', name: 'Claude (Analyst)' },
        { id: 'gpt4', name: 'GPT-4 (Architect)' }
      ];
      const activeCouncil = masterCouncil.slice(0, modelLimit);

      // 5. PARALLEL SUMMONING USING THE ENGINE
      activeCouncil.forEach(async (member) => {
        try {
          const text = await generateCouncilResponse(postData.content, member.id);
          io.emit('ai:response', { id: crypto.randomUUID(), name: member.name, content: text, sender: 'ai', isVerdict: false });
        } catch (err) { console.error(`❌ ${member.name} failed:`, err); }
      });
    } catch (error) { console.error('❌ Summoning Failed:', error); }
  });

  socket.on('disconnect', () => console.log('❌ Connection Terminated'));
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Nexus Backend Live on Port ${PORT}`));
