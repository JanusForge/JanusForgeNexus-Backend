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
import dailyForgeRouter from './routes/dailyForge';

dotenv.config();
const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

// Configuration
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- 🔑 AUTH ROUTES (FIXES THE 404 LOGIN ERROR) ---
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, referralCode = "" } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username, email, password_hash: hashedPassword,
        role: referralCode.trim().toUpperCase() === 'BETA_2026' ? UserRole.BETA_ARCHITECT : UserRole.USER,
        tokens_remaining: 50, token_balance: 50
      }
    });
    res.status(201).json(user);
  } catch (error) { res.status(400).json({ error: "Registration failed" }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(user);
  } catch (error) { res.status(500).json({ error: "Auth Failure" }); }
});

// --- 🛰️ DAILY FORGE ROUTES ---
app.use('/api/daily-forge', dailyForgeRouter);

// --- 🏛️ SOCKETS (FIXES THE PERSISTENT SPINNER) ---
const io = new Server(httpServer, { cors: { origin: true, credentials: true } });

io.on('connection', (socket) => {
  socket.on('post:new', async (postData) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: postData.userId } });
      const activeConversation = await prisma.conversation.findFirst({ where: { is_daily_forge: true }, orderBy: { created_at: 'desc' } });

      if (!user || !activeConversation) return;

      const saved = await prisma.$transaction(async (tx) => {
        if (user.role !== 'GOD_MODE') {
          await tx.user.update({ where: { id: user.id }, data: { tokens_remaining: { decrement: 1 } } });
        }
        return await tx.post.create({ data: { content: postData.content, is_human: true, user_id: user.id, conversation_id: activeConversation.id } });
      });

      // 🚀 THE KILL-SWITCH: Emit immediately to stop the spinner
      io.emit('post:incoming', { 
        id: saved.id, name: user.username, content: saved.content, sender: 'user', 
        tokens_remaining: user.role === 'GOD_MODE' ? 999999 : user.tokens_remaining - 1 
      });

      // Council Trigger
      (async () => {
        try {
          const gemModel = genAI.getGenerativeModel({ model: "gemini-pro" });
          const result = await gemModel.generateContent(postData.content);
          io.emit('post:incoming', { id: crypto.randomUUID(), name: "GEMINI", content: result.response.text(), sender: 'ai' });
        } catch (e) { console.error("AI Error", e); }
      })();

    } catch (e) { console.error("Socket Error", e); }
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Live on ${PORT}`));
