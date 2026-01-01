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

// --- ⚙️ SERVICE INITIALIZATION ---
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

app.use(cors({ origin: (origin, callback) => callback(null, true), credentials: true }));
app.use(express.json());

// --- 🔑 AUTH & TIERED LEDGER (Preserved) ---
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, referralCode = "" } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const isBeta = referralCode.trim().toUpperCase() === 'BETA_2026';
    const user = await prisma.user.create({
      data: {
        username, email, password_hash: hashedPassword,
        role: isBeta ? UserRole.BETA_ARCHITECT : UserRole.USER,
        tokens_remaining: isBeta ? 50 : 10, token_balance: isBeta ? 50 : 10,
        digest_subscribed: true
      }
    });
    res.status(201).json(user);
  } catch (error) { res.status(400).json({ error: "Registration conflict." }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Unauthorized" });
    res.json(user);
  } catch (error) { res.status(500).json({ error: "Login failed." }); }
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

// --- 🛰️ DAILY FORGE STATUS ---
app.use('/api/daily-forge', dailyForgeRouter);
app.get('/api/daily-forge/status', async (req, res) => {
  try {
    const latest = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
    res.json({ topic: latest?.winningTopic, scoutQuote: latest?.openingThoughts, councilQuote: latest?.councilVotes });
  } catch (error) { res.status(500).json({ error: "Sync Failure" }); }
});

app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", timestamp: new Date().toISOString() }));

// --- 🏛️ ADVERSARIAL DISCOURSE ENGINE (SOCKETS) ---
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  pingTimeout: 60000,
  connectionStateRecovery: {}
});

io.on('connection', (socket) => {
  socket.on('post:new', async (postData) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: postData.userId } });
      const activeConversation = await prisma.conversation.findFirst({
          where: { is_daily_forge: true },
          orderBy: { created_at: 'desc' }
      });

      const targetConversationId = postData.conversationId || activeConversation?.id;
      if (!targetConversationId) throw new Error("No active thread detected.");

      // 🛠️ IDENTITY MAPPING: Separating Beta Architect from Enterprise/GodMode
      const isGodMode = user?.role === 'GOD_MODE';
      const isEnterprise = user?.role === 'ENTERPRISE';
      const isBeta = user?.role === 'BETA_ARCHITECT';

      // Permission Gate: GodMode and Enterprise bypass token drain
      const hasTokenBypass = isGodMode || isEnterprise;

      if (!user || (!hasTokenBypass && user.tokens_remaining < 1)) {
        socket.emit('error', { message: "Nexus tokens required." });
        return;
      }

      const savedPost = await prisma.$transaction(async (tx) => {
        if (!hasTokenBypass) {
          await tx.user.update({ where: { id: user.id }, data: { tokens_remaining: { decrement: 1 } } });
        }
        return await tx.post.create({
          data: {
            content: postData.content,
            is_human: true,
            user_id: user.id,
            conversation_id: targetConversationId
          }
        });
      });

      // 📢 GLOBAL BROADCAST: Unlocks UI for all privileged roles
      io.emit('post:incoming', {
        id: savedPost.id,
        name: user.username,
        content: savedPost.content,
        sender: 'user',
        role: user.role,
        tokens_remaining: hasTokenBypass ? 999999 : user.tokens_remaining - 1
      });

      const runCouncilMember = async (name: string, modelCall: () => Promise<string>) => {
        try {
          const content = await modelCall();
          // Broadcast to everyone to ensure AIs "see" each other in the stream
          io.emit('post:incoming', { id: crypto.randomUUID(), name, content, sender: 'ai', role: 'COUNCIL' });
        } catch (aiErr) { console.error(`[${name} FAILURE]`, aiErr); }
      };

      (async () => {
        // 🚀 THE FULL SUMMONING: Fires for Enterprise, GodMode, or Beta Architect
        const isFullCouncil = isGodMode || isEnterprise || isBeta || user.role === 'PROFESSIONAL';
        const isBasicPlus = isBeta || user.role === 'BASIC' || isFullCouncil;

        runCouncilMember("GEMINI", async () => {
          const res = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(postData.content);
          return res.response.text();
        });

        runCouncilMember("DEEPSEEK", async () => {
          const res = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "system", content: "Respond in English." }, { role: "user", content: postData.content }]
          });
          return res.choices[0].message.content || "";
        });

        if (isBasicPlus) {
          runCouncilMember("GROK", async () => {
            const res = await openai.chat.completions.create({ model: "grok-beta", messages: [{ role: "user", content: postData.content }] });
            return res.choices[0].message.content || "";
          });
        }

        if (isFullCouncil) {
          runCouncilMember("CLAUDE", async () => {
            const res = await anthropic.messages.create({ model: "claude-3-opus-20240229", max_tokens: 1024, messages: [{ role: "user", content: postData.content }] });
            return (res.content[0] as any).text;
          });
          runCouncilMember("GPT_4", async () => {
            const res = await openai.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: postData.content }] });
            return res.choices[0].message.content || "";
          });
        }
      })();
    } catch (error: any) {
      io.emit('error', { message: "Channel Sync Lost." });
    }
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Live on ${PORT}`));
