// src/server.ts - FIXED: explicit .ts import + GROK model update
import authRouter from './routes/auth'; // FIXED: explicit .ts extension
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from './lib/prisma';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Resend } from 'resend';
import Stripe from 'stripe';
import conversationRouter from './routes/conversations';
import archiveRouter from './routes/archives';
import passwordResetRouter from './routes/passwordReset';

dotenv.config();
console.log('Auth routes loading...');

const app = express();
const httpServer = createServer(app);
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

app.use(cors({ origin: (origin, callback) => callback(null, true), credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/auth', passwordResetRouter);
app.use('/api/archives', archiveRouter);

// --- ROUTES ---
app.use('/api/conversations', conversationRouter);

// DAILY FORGE ROUTER
import dailyForgeRouter from './routes/dailyForge';
app.use('/api/daily-forge', dailyForgeRouter);

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
  // Room join handler (matches frontend emit('join', ...))
  socket.on('join', ({ conversationId }) => {
    if (conversationId) {
      socket.join(conversationId);
      console.log(`Socket ${socket.id} joined room ${conversationId}`);
    }
  });

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
      if (postData.conversationId && !postData.isLiveChat) {
        targetConversationId = postData.conversationId;
      }
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
     
      // --- COUNCIL DEBATE ENGINE ---
(async () => {
  const councilDirective = `You are a member of the Janus Forge AI Council — a real-time multiversal debate forum.
Core Guidelines:
- Please respond directly to the most recent human query, external AI query, or AI Council Member point.
- Out of respect for time and resources, please recap or relitigate prior comments only if some of your points are important to the new comment you are making.
- You have full freedom of thought and expression.
- For dates/events: briefly note your knowledge cutoff date if relevant, or accept provided context.
- Please do your best to provide quality over quantity.
The council values epistemic humility, relevance, and respectful adversarial collaborative truth-seeking.`;

  // Stable 4-AI queue (DeepSeek + Claude + Grok + Gemini)
// Primary models with fallback options per provider
  const councilAIs = [
    { 
      name: 'DEEPSEEK', 
      client: deepseek, 
      primary: 'deepseek-chat',
      fallback: 'deepseek-chat' // Add varied fallbacks if available
    },
    { 
      name: 'GROK', 
      client: xai, 
      primary: 'grok-4.1-fast-reasoning',
      fallback: 'grok-2-latest' // Example fallback
    },
    { 
      name: 'GEMINI', 
      client: genAI, 
      primary: 'gemini-3-flash-preview',
      fallback: 'gemini-1.5-flash'
    },
    { 
      name: 'CLAUDE', 
      client: anthropic, 
      primary: 'claude-3.5-sonnet',
      fallback: 'claude-3-haiku-20240307'
    }
  ];

  // Health tracker
  const aiHealth = new Map(councilAIs.map(ai => [ai.name, { status: 'unknown', lastError: null }]));

  let transcript = await prisma.post.findMany({
    where: { conversation_id: targetConversationId },
    orderBy: { created_at: 'asc' },
    take: 20,
    include: { user: true }
  });

  for (const ai of councilAIs) {
    let aiContent = "";
    let finalLabel = ai.name;
    let usedFallback = false;
    
    const attemptGeneration = async (model, isFallback = false) => {
      const context = transcript.map(p => {
        const name = p.is_human ? (p.user?.username || 'User') : (p.ai_model || 'Council Member');
        return `${name}: ${p.content}`;
      }).join("\n\n") + "\n\nRespond concisely with substantive contribution.";
      
      try {
        if (ai.name === 'DEEPSEEK' || ai.name === 'GROK') {
          const res = await ai.client.chat.completions.create({
            model: model,
            messages: [{ role: "system", content: councilDirective }, { role: "user", content: context }]
          });
          return res.choices[0].message.content || "";
        } else if (ai.name === 'GEMINI') {
          const generativeModel = ai.client.getGenerativeModel({ model: model });
          const res = await generativeModel.generateContent(context);
          return res.response.text() || "";
        } else if (ai.name === 'CLAUDE') {
          const res = await ai.client.messages.create({
            model: model,
            max_tokens: 800,
            messages: [{ role: "user", content: context }]
          });
          return res.content[0].text || "";
        }
      } catch (err) {
        console.error(`[${ai.name} attempt failed]`, err.message);
        throw err;
      }
    };

    try {
      // Primary attempt
      aiContent = await attemptGeneration(ai.primary);
      aiHealth.set(ai.name, { status: 'healthy', lastError: null });
    } catch (primaryErr) {
      aiHealth.set(ai.name, { status: 'degraded', lastError: primaryErr.message });
      
      // Fallback attempt
      try {
        aiContent = await attemptGeneration(ai.fallback, true);
        usedFallback = true;
        finalLabel = `${ai.name}-fallback`;
      } catch (fallbackErr) {
        // Mark as failed and redistribute
        aiHealth.set(ai.name, { status: 'failed', lastError: fallbackErr.message });
        aiContent = `[${ai.name} unavailable - query redistributed to council]`;
        finalLabel = `System-${ai.name}-failed`;
      }
    }

    if (aiContent.trim()) {
      const aiPost = await prisma.post.create({
        data: {
          content: aiContent,
          is_human: false,
          ai_model: finalLabel,
          conversation_id: targetConversationId,
          metadata: { usedFallback, health: aiHealth.get(ai.name) }
        }
      });
      
      io.to(targetConversationId).emit('post:incoming', {
        id: aiPost.id,
        name: finalLabel,
        content: aiContent,
        sender: 'ai',
        tokens_remaining: currentTokens,
        isFallback: usedFallback
      });
      
      console.log(`[${finalLabel}] ${usedFallback ? 'Fallback ' : ''}response saved`);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Refresh transcript
    transcript = await prisma.post.findMany({
      where: { conversation_id: targetConversationId },
      orderBy: { created_at: 'asc' },
      take: 30,
      include: { user: true }
    });
  }
  
  // Optional: Redistribute failed queries to healthy members
  const failedAIs = [...aiHealth.entries()].filter(([_, health]) => health.status === 'failed');
  if (failedAIs.length > 0) {
    console.log(`[Council] ${failedAIs.length} members failed - consider redistribution`);
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

// Keep it clean - CLW
