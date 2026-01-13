// src/server.ts
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
import Stripe from 'stripe';
import conversationRouter from './routes/conversations';
import archiveRouter from './routes/archives';
import passwordResetRouter from './routes/passwordReset';
import dailyForgeRouter from './routes/dailyForge';
import { triggerCouncilDebate } from './lib/councilDebate';
import adminRouter from './routes/admin';

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

app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));
app.use(express.json());

// --- 🛣️ ROUTES ---
app.use('/api/auth', authRouter);
app.use('/api/auth', passwordResetRouter);
app.use('/api/archives', archiveRouter);
app.use('/api/conversations', conversationRouter);
app.use('/api/daily-forge', dailyForgeRouter);
app.use('/api/admin', adminRouter);

app.get('/', (req, res) => res.status(200).json({
  status: "ONLINE",
  timestamp: new Date().toISOString()
}));

// --- 🏛️ SOCKET ENGINE ---
const io = new Server(httpServer, {
  cors: {
    origin: ["https://janusforge.ai", "https://www.janusforge.ai", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000
});

app.set('io', io);
app.set('aiClients', aiClients);

io.on('connection', (socket) => {
  console.log(`🏛️ Socket Connected: ${socket.id}`);

  socket.on('join', ({ conversationId }) => {
    if (conversationId) {
      socket.rooms.forEach(room => {
        if (room !== socket.id) socket.leave(room);
      });
      socket.join(conversationId);
      console.log(`👤 Socket ${socket.id} joined room: ${conversationId}`);
    }
  });

  socket.on('post:new', async (postData) => {
    try {
      const { conversationId, content, userId } = postData;

      if (!conversationId || !content || !userId) {
        return socket.emit('error', { message: "Incomplete post data." });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return socket.emit('error', { message: "User not recognized." });

      // --- 🛡️ ADMIN & TOKEN GATE ---
      // Hardcoded bypass for the site owner
      const isOwner = user.email === 'admin@janusforge.ai' || user.role === 'GOD_MODE';
      const DEBATE_COST = 3; 

      if (!isOwner && user.tokens_remaining < DEBATE_COST) {
        return socket.emit('error', { 
          message: `Synthesis requires ${DEBATE_COST} tokens. Balance: ${user.tokens_remaining}` 
        });
      }

      const [savedPost, updatedUser] = await prisma.$transaction(async (tx) => {
        if (!isOwner) {
          await tx.user.update({
            where: { id: userId },
            data: {
              tokens_remaining: { decrement: DEBATE_COST },
              tokens_used: { increment: DEBATE_COST }
            }
          });
        }

        return await Promise.all([
          tx.post.create({
            data: {
              content,
              is_human: true,
              user_id: userId,
              conversation_id: conversationId
            }
          }),
          tx.user.findUnique({ where: { id: userId } })
        ]);
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

      triggerCouncilDebate({
        conversationId,
        io,
        currentTokens,
        ...aiClients
      }).catch(err => {
        console.error(`❌ Council Error:`, err);
        io.to(conversationId).emit('council:error', { message: "Council failed to synthesize." });
      });

    } catch (error: any) {
      console.error("🔥 Critical Socket Error:", error);
      socket.emit('error', { message: "Channel synchronization lost." });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Nexus Live on ${PORT}`));
