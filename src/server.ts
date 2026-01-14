// src/server.ts
import authRouter from './routes/auth';
import nexusRouter from './services/nexus-core/nexus-router';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from './lib/prisma';
import Stripe from 'stripe';
import conversationRouter from './routes/conversations';
import archiveRouter from './routes/archives';
import passwordResetRouter from './routes/passwordReset';
import dailyForgeRouter from './routes/dailyForge';
import adminRouter from './routes/admin';
import { triggerCouncilDebate } from './lib/councilDebate';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// --- ⚙️ SERVICE INITIALIZATION ---
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

export const aiClients = { deepseek, xai, genAI, anthropic };

// --- 🛡️ UNIFIED CORS CONFIGURATION ---
const CORS_OPTIONS = {
  origin: (origin: any, callback: any) => callback(null, true),
  credentials: true
};

app.use(cors(CORS_OPTIONS));
app.use(express.json());

// --- 🛣️ ROUTES ---
app.use('/api/auth', authRouter);
app.use('/api/auth', passwordResetRouter);
app.use('/api/archives', archiveRouter);
app.use('/api/conversations', conversationRouter);
app.use('/api/daily-forge', dailyForgeRouter);
app.use('/api/admin', adminRouter);
app.use('/api/nexus', nexusRouter); // Mounting the Nexus Core

app.get('/', (req, res) => res.status(200).json({
  status: "ONLINE",
  timestamp: new Date().toISOString(),
  owner: "Cassandra"
}));

// --- 🏛️ SOCKET ENGINE ---
const io = new Server(httpServer, {
  cors: CORS_OPTIONS,
  pingTimeout: 60000,
  transports: ['websocket', 'polling']
});

app.set('io', io);
app.set('aiClients', aiClients);

io.on('connection', (socket) => {
  console.log(`🏛️ Socket Connected: ${socket.id}`);

  // --- Standard Daily Forge Join ---
  socket.on('join', ({ conversationId }) => {
    if (conversationId) {
      socket.rooms.forEach(room => {
        if (room !== socket.id) socket.leave(room);
      });
      socket.join(conversationId);
      console.log(`👤 Socket ${socket.id} joined room: ${conversationId}`);
    }
  });

  // --- Nexus Prime Specific Room Join (Independent Listener) ---
  socket.on('join:room', (conversationId) => {
    if (conversationId) {
      socket.join(conversationId);
      console.log(`👤 Nexus Neural Link: Socket ${socket.id} joined ${conversationId}`);
    }
  });

  // Handle Interjections / Deploys via Socket
  socket.on('post:new', async (postData) => {
    try {
      const { conversationId, content, userId } = postData;
      if (!conversationId || !content || !userId) return;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return;

      const isOwner = user.email === 'admin@janusforge.ai' || user.role === 'GOD_MODE';
      const DEBATE_COST = 3;

      if (!isOwner && user.tokens_remaining < DEBATE_COST) {
        return socket.emit('error', { message: "Insufficient tokens." });
      }

      const [savedPost, updatedUser] = await prisma.$transaction(async (tx) => {
        await tx.conversation.update({
          where: { id: conversationId },
          data: { user_id: userId }
        });

        const post = await tx.post.create({
          data: {
            content,
            is_human: true,
            user_id: userId,
            conversation_id: conversationId
          }
        });

        if (!isOwner) {
          await tx.user.update({
            where: { id: userId },
            data: { tokens_remaining: { decrement: DEBATE_COST } }
          });
        }

        return [post, await tx.user.findUnique({ where: { id: userId } })];
      });

      const currentTokens = isOwner ? 999999 : (updatedUser?.tokens_remaining ?? 0);

      io.to(conversationId).emit('post:incoming', {
        id: savedPost.id,
        name: user.username,
        content: savedPost.content,
        sender: 'user',
        tokens_remaining: currentTokens,
        created_at: savedPost.created_at,
        conversationId
      });

      triggerCouncilDebate({ conversationId, io, currentTokens, ...aiClients })
        .catch(err => console.error(`❌ Council Error:`, err));

    } catch (error: any) {
      console.error("🔥 Socket Transaction Error:", error.message);
      socket.emit('error', { message: "Synchronization failed." });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Nexus Live on ${PORT}`));
