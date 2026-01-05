import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Resend } from 'resend';
import Stripe from 'stripe';
import conversationRouter from './routes/conversations';
import archiveRouter from './routes/archives';

dotenv.config();
console.log('Auth routes loading...');

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
const xai = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

app.use('/api/archives', archiveRouter);
app.use(cors({ origin: (origin, callback) => callback(null, true), credentials: true }));
app.use(express.json());

// --- 🔑 AUTH & TOKEN SYSTEM ---
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, referralCode = "" } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const isBeta = referralCode.trim().toUpperCase() === 'BETA_2026';
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password_hash: hashedPassword,
        role: isBeta ? 'BETA_ARCHITECT' : 'USER',
        tokens_remaining: isBeta ? 50 : 10,
        token_balance: isBeta ? 50 : 10,
        digest_subscribed: true
      }
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: "Registration conflict." });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    console.log(`🔐 Login attempt for: ${email}`);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    console.log("✅ Login Success");
    res.json(user);
  } catch (error: any) {
    console.error("🔥 CRITICAL LOGIN ERROR:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- ROUTES ---
app.use('/api/conversations', conversationRouter);

app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", timestamp: new Date().toISOString() }));

// --- 💳 STRIPE CHECKOUT (Token Packs Only) ---
app.post('/api/v1/billing/checkout', async (req, res) => {
  const { priceId, userId } = req.body;
  if (!priceId || !userId) {
    return res.status(400).json({ error: "Missing priceId or userId" });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `https://janusforge.ai/pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://janusforge.ai/pricing?canceled=true`,
      metadata: { userId }
    });
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);
    res.status(500).json({ error: "Checkout failed", details: error.message });
  }
});

// --- 🏛️ ADMIN: Manual Archive Entry ---
app.post('/api/daily-forge/manual', async (req, res) => {
  const { userId, winningTopic, openingThoughts } = req.body;
  if (!userId || !winningTopic || !openingThoughts) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'GOD_MODE') {
      return res.status(403).json({ error: "GodMode required" });
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const newEntry = await prisma.dailyForge.create({
      data: {
        date: today,
        scoutedTopics: "[]",
        winningTopic,
        openingThoughts: typeof openingThoughts === 'string' ? openingThoughts : JSON.stringify(openingThoughts),
        councilVotes: "{}",
        phase: "MANUAL_ARCHIVE"
      }
    });
    res.json({ success: true, entry: newEntry });
  } catch (error: any) {
    console.error("Manual archive error:", error);
    res.status(500).json({ error: "Failed to save archive entry" });
  }
});

// --- 🏛️ ADVERSARIAL DISCOURSE ENGINE (SOCKETS) ---
const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://janusforge.ai",
      "https://www.janusforge.ai",
      "http://localhost:3000",
      "http://localhost:3001"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  connectionStateRecovery: {}
});

// Make io available in routes
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('post:new', async (postData) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: postData.userId } });
      if (!user) {
        socket.emit('error', { message: "User not found." });
        return;
      }
      const isGodMode = user.role === 'GOD_MODE';
      const hasTokenBypass = isGodMode;
      if (!hasTokenBypass && user.tokens_remaining < 1) {
        socket.emit('error', { message: "Nexus tokens required." });
        return;
      }

      // Determine target conversation
      let targetConversationId: string = postData.conversationId;

      if (!targetConversationId) {
        if (postData.isLiveChat) {
          let liveChatConvo = await prisma.conversation.findFirst({
            where: { title: "Live Nexus Chat", is_daily_forge: false }
          });
          if (!liveChatConvo) {
            liveChatConvo = await prisma.conversation.create({
              data: { title: "Live Nexus Chat", is_daily_forge: false }
            });
          }
          targetConversationId = liveChatConvo.id;
        } else {
          const activeConversation = await prisma.conversation.findFirst({
            where: { is_daily_forge: true },
            orderBy: { created_at: 'desc' }
          });
          targetConversationId = activeConversation?.id;
        }
      }
      if (!targetConversationId) throw new Error("No active thread detected.");

      socket.join(targetConversationId);

      const [savedPost, updatedUser] = await prisma.$transaction(async (tx) => {
        if (!hasTokenBypass) {
          await tx.user.update({
            where: { id: user.id },
            data: { tokens_remaining: { decrement: 1 } }
          });
        }
        const post = await tx.post.create({
          data: {
            content: postData.content,
            is_human: true,
            user_id: user.id,
            conversation_id: targetConversationId
          }
        });
        const refreshedUser = await tx.user.findUnique({ where: { id: user.id } });
        return [post, refreshedUser];
      });

      const currentTokens = hasTokenBypass ? 999999 : updatedUser!.tokens_remaining;

      io.to(targetConversationId).emit('post:incoming', {
        id: savedPost.id,
        name: user.username,
        content: savedPost.content,
        sender: 'user',
        role: user.role,
        tokens_remaining: currentTokens
      });

      // --- COUNCIL DEBATE ENGINE (per Council guidance) ---
      (async () => {
        const councilDirective = `You are a member of the Janus Forge AI Council — a real-time multiversal debate forum.

Core Guidelines:
- Please respond directly to the most recent human query, external AI query, or AI Council Member point.
- Out of respoct for time and resources,please recap or relitigate prior comments you made only if some of your points are important to the new comment you are making.
- You have full freedom of thought and expression.
- For dates/events: briefly note your knowledge cutoff date if relevant, or accept provided context.
- Please do your best to provide quality over quantity.

The council values epistemic humility, relevance, and respectful adversarial collaborative truth-seeking.`;

        let councilQueue = [
          { name: "GEMINI", modelKey: "gemini-2.5-pro" },
          { name: "DEEPSEEK", modelKey: "deepseek-chat" },
          { name: "GROK", modelKey: "grok-4.1-fast" },
          { name: "CLAUDE", modelKey: "claude-opus-4-5-20251101" },
          { name: "GPT_4", modelKey: "gpt-5.2" }
        ];

        let transcript = await prisma.post.findMany({
          where: { conversation_id: targetConversationId },
          orderBy: { created_at: 'asc' },
          take: 20
        });

        // Phase 1: Initial full round
        for (const ai of councilQueue) {
          const context = transcript.map(p => {
            const name = p.is_human ? 'Architect (Cassandra)' : (p.ai_model || 'Council Member');
            return `${name}: ${p.content}`;
          }).join("\n\n") + `\n\nAs ${ai.name}, respond with your unique perspective. Look ofr new ways of thinking, collaboratinig, with relevance, and brevity (to manage our costs and resource utilization).`;          

          // ... your existing AI generation logic ...
          // (same as before — generate aiContent, save post, emit)

          if (aiContent && aiContent.trim()) {
            const aiPost = await prisma.post.create({
              data: {
                content: aiContent,
                is_human: false,
                ai_model: ai.name as any,
                conversation_id: targetConversationId
              }
            });

            io.to(targetConversationId).emit('post:incoming', {
              id: aiPost.id,
              name: ai.name,
              content: aiContent,
              sender: 'ai',
              tokens_remaining: currentTokens
            });

            await new Promise(r => setTimeout(r, 1500));
            console.log(`📡 [Nexus Sync] ${ai.name} response settled.`);
          }

          // Refresh transcript
          transcript = await prisma.post.findMany({
            where: { conversation_id: targetConversationId },
            orderBy: { created_at: 'asc' },
            take: 30
          });
        }

        // Phase 2: Intelligent follow-ups (max 2 rounds)
        let followUpRounds = 0;
        const maxFollowUpRounds = 2;

        while (followUpRounds < maxFollowUpRounds) {
          const lastHuman = transcript.slice().reverse().find(p => p.is_human);
          const hasTrigger = lastHuman && lastHuman.content.match(/\?|why|but|however|explain|clarify|what about|you think/i);

          if (!hasTrigger) break;

          // Randomize order for variety
          const shuffled = [...councilQueue].sort(() => Math.random() - 0.5);
          let responded = false;

          for (const ai of shuffled) {
            const context = transcript.map(p => {
              const name = p.is_human ? 'Architect (Cassandra)' : (p.ai_model || 'Council Member');
              return `${name}: ${p.content}`;
            }).join("\n\n") + "\n\nRespond only if you have a meaningful new insight or direct response to the latest message.";

            // ... same AI generation logic ...

            if (aiContent && aiContent.trim().length > 50) {
              const aiPost = await prisma.post.create({
                data: {
                  content: aiContent,
                  is_human: false,
                  ai_model: ai.name as any,
                  conversation_id: targetConversationId
                }
              });

              io.to(targetConversationId).emit('post:incoming', {
                id: aiPost.id,
                name: ai.name,
                content: aiContent,
                sender: 'ai',
                tokens_remaining: currentTokens
              });

              responded = true;
              await new Promise(r => setTimeout(r, 2500));
            }
          }

          if (!responded) break;
          followUpRounds++;

          // Refresh transcript
          transcript = await prisma.post.findMany({
            where: { conversation_id: targetConversationId },
            orderBy: { created_at: 'asc' },
            take: 40
          });
        }
      })();
    } catch (error: any) {
      console.error("Socket post:new error:", error);
      socket.emit('error', { message: "Channel Sync Lost." });
    }
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Live on ${PORT}`));
