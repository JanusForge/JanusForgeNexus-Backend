// src/server.ts - COMPLETE FIXED VERSION
import authRouter from './routes/auth';
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
import dailyForgeRouter from './routes/dailyForge';
import { triggerCouncilDebate } from './lib/councilDebate';

dotenv.config();
console.log('Auth routes loading...');

const app = express();
const httpServer = createServer(app);
const resend = new Resend(process.env.RESEND_API_KEY);

// --- ⚙️ SERVICE INITIALIZATION (GLOBAL) ---
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ 
  apiKey: process.env.DEEPSEEK_API_KEY, 
  baseURL: "https://api.deepseek.com" 
});
const xai = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

// Export AI clients for use in routes
export const aiClients = { deepseek, xai, genAI, anthropic };

app.use(cors({ 
  origin: (origin, callback) => callback(null, true), 
  credentials: true 
}));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/auth', passwordResetRouter);
app.use('/api/archives', archiveRouter);

// --- ROUTES ---
app.use('/api/conversations', conversationRouter);

// DAILY FORGE ROUTER
app.use('/api/daily-forge', dailyForgeRouter);

app.get('/', (req, res) => res.status(200).json({ 
  status: "ONLINE", 
  timestamp: new Date().toISOString() 
}));

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
        openingThoughts: typeof openingThoughts === 'string' 
          ? openingThoughts 
          : JSON.stringify(openingThoughts),
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

// Make io and aiClients available in routes
app.set('io', io);
app.set('aiClients', aiClients);

io.on('connection', (socket) => {
  console.log(`Socket ${socket.id} connected`);

  // Room join handler
  socket.on('join', ({ conversationId }) => {
    if (conversationId) {
      socket.join(conversationId);
      console.log(`Socket ${socket.id} joined room ${conversationId}`);
    }
  });

  // PRIVATE CHAT: Socket-based post submission (subscribers only)
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
          targetConversationId = activeConversation?.id || '';
        }
      }
      
      if (!targetConversationId) {
        throw new Error("No active thread detected.");
      }
      
      socket.join(targetConversationId);

      // Create post and update tokens
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
      
      // Emit user's post to room
      io.to(targetConversationId).emit('post:incoming', {
        id: savedPost.id,
        name: user.username,
        content: savedPost.content,
        sender: 'user',
        role: user.role,
        tokens_remaining: currentTokens,
        created_at: savedPost.created_at
      });

      console.log(`[Private Chat] User ${user.username} posted to ${targetConversationId}`);

      // Trigger AI council debate (async, doesn't block)
      triggerCouncilDebate({
        conversationId: targetConversationId,
        io,
        currentTokens,
        deepseek,
        xai,
        genAI,
        anthropic
      }).catch(err => {
        console.error('[Private Chat] Council debate error:', err);
        io.to(targetConversationId).emit('council:error', {
          message: 'Council debate encountered an error',
          details: err.message
        });
      });

    } catch (error: any) {
      console.error("Socket post:new error:", error);
      socket.emit('error', { 
        message: "Channel Sync Lost.", 
        details: error.message 
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Live on ${PORT}`));

// Keep it clean - CLW
