import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient, UserRole } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Resend } from 'resend';
import Stripe from 'stripe';
import dailyForgeRouter from './routes/dailyForge';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

app.use(cors({ origin: (origin, callback) => callback(null, true), credentials: true }));
app.use(express.json());

// --- 🔑 AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, referralCode = "" } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const isBeta = referralCode.trim().toUpperCase() === 'BETA_2026';
    const user = await prisma.user.create({
      data: {
        username, email, password_hash: hashedPassword,
        role: isBeta ? UserRole.BETA_ARCHITECT : UserRole.USER,
        tokens_remaining: isBeta ? 50 : 10, token_balance: isBeta ? 50 : 10, digest_subscribed: true
      }
    });
    res.status(201).json(user);
  } catch (error) { res.status(400).json({ error: "Username or Email already in use." }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Unauthorized" });
    res.json(user);
  } catch (error) { res.status(500).json({ error: "Auth Failure" }); }
});

// --- 💳 STRIPE WEBHOOK ---
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET as string);
  } catch (err: any) { return res.status(400).send(`Webhook Error: ${err.message}`); }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    await prisma.user.update({ where: { id: session.metadata.userId }, data: { tokens_remaining: { increment: 50 } } });
  }
  res.json({ received: true });
});

// --- 🛰️ DAILY FORGE ROUTER ---
app.use('/api/daily-forge', dailyForgeRouter);
app.get('/api/daily-forge/status', async (req, res) => {
  try {
    const latest = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
    res.json({ topic: latest?.winningTopic, scoutQuote: latest?.openingThoughts, councilQuote: latest?.councilVotes });
  } catch (error) { res.status(500).json({ error: "Sync Error" }); }
});

app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", timestamp: new Date().toISOString() }));

// --- 🏛️ REAL-TIME ADVERSARIAL DISCOURSE ENGINE ---
const io = new Server(httpServer, { cors: { origin: true, credentials: true }, pingTimeout: 60000 });

io.on('connection', (socket) => {
  socket.on('post:new', async (postData) => {
    try {
      const [user, activeConversation] = await Promise.all([
        prisma.user.findUnique({ where: { id: postData.userId } }),
        prisma.conversation.findFirst({ where: { is_daily_forge: true }, orderBy: { created_at: 'desc' } })
      ]);

      if (!activeConversation) throw new Error("No active Forge stream.");
      const isGodMode = user?.role === UserRole.GOD_MODE;

      if (!user || (!isGodMode && user.tokens_remaining < 1)) {
        socket.emit('error', { message: "Insufficient Tokens." });
        return;
      }

      const saved = await prisma.$transaction(async (tx) => {
        if (!isGodMode) {
          await tx.user.update({ where: { id: user.id }, data: { tokens_remaining: { decrement: 1 } } });
        }
        return await tx.post.create({ data: { content: postData.content, is_human: true, user_id: user.id, conversation_id: activeConversation.id } });
      });

      // 🚀 KILL-SWITCH: Stops the "spinny" and syncs UI tokens
      io.emit('post:incoming', {
        id: saved.id, name: user.username, content: postData.content, sender: 'user', role: user.role,
        tokens_remaining: isGodMode ? 999999 : user.tokens_remaining - 1
      });

      // 🛰️ THE PENTARCHY SUMMONING Helper
      const runAI = async (name: string, modelCall: () => Promise<string>) => {
        try {
          const content = await modelCall();
          io.emit('post:incoming', { id: crypto.randomUUID(), name, content, sender: 'ai', role: 'COUNCIL' });
        } catch (err) { console.error(`[COUNCIL FAILURE: ${name}]`, err); }
      };

      (async () => {
        const isPro = user.role === 'PROFESSIONAL' || isGodMode;
        const isBasic = user.role === 'BETA_ARCHITECT' || user.role === 'BASIC' || isPro;

        // FREE TIER
        runAI("GEMINI", async () => {
        // Fixed model name to prevent 404 Fetch Error
          const gemModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); 
          const gemResult = await gemModel.generateContent(`Adversarial Response: ${postData.content}`);
          return gemResult.response.text();
        });        

        runAI("DEEPSEEK", async () => {
          const res = await deepseek.chat.completions.create({ model: "deepseek-chat", messages: [{ role: "user", content: postData.content }] });
          return res.choices[0].message.content || "Synthesis error.";
        });

        // BASIC TIER
        if (isBasic) {
          runAI("GROK", async () => {
            const res = await openai.chat.completions.create({ model: "grok-beta", messages: [{ role: "user", content: postData.content }] });
            return res.choices[0].message.content || "Synthesis error.";
          });
        }

        // PRO TIER
        if (isPro) {
          runAI("CLAUDE", async () => {
            const res = await anthropic.messages.create({ model: "claude-3-opus-20240229", max_tokens: 1024, messages: [{ role: "user", content: postData.content }] });
            return (res.content[0] as any).text;
          });
          runAI("GPT_4", async () => {
            const res = await openai.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: postData.content }] });
            return res.choices[0].message.content || "Synthesis error.";
          });
        }
      })();

    } catch (e: any) { socket.emit('error', { message: "Synthesis failed." }); }
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Live on ${PORT}`));
