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

dotenv.config();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

// --- AI CLIENTS ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

// --- MIDDLEWARE ---
const allowedOrigins = ['https://janusforge.ai', 'https://www.janusforge.ai', /\.vercel\.app$/, 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// --- 🔑 AUTHENTICATION (The Gates) ---
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: "Unauthorized" });

    res.json({ id: user.id, email: user.email, username: user.username, role: user.role, token_balance: user.token_balance });
  } catch (err) { res.status(500).json({ error: "Auth Failure" }); }
});

app.get('/', (req, res) => { res.status(200).json({ status: "ONLINE" }); });

// --- 🏛️ SOCKET.IO (The Council) ---
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true },
  transports: ['polling', 'websocket']
});

io.on('connection', (socket) => {
  console.log('⚡ Nexus Connection Established');
  socket.on('post:new', async (postData) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: postData.userId } });
      if (!user || (user.role !== 'GOD_MODE' && user.token_balance < 1)) return;

      io.emit('post:incoming', { id: crypto.randomUUID(), name: user.username, content: postData.content, sender: 'user' });

      // ALIGNED WITH YOUR SCHEMA ENUMS: GROK, GEMINI_PRO, CLAUDE, CHATGPT, DEEPSEEK
      const activeModels = [
        { id: 'CHATGPT', name: 'GPT-4 (Architect)' },
        { id: 'CLAUDE', name: 'Claude (Analyst)' },
        { id: 'DEEPSEEK', name: 'DeepSeek (Logic)' }
      ];

      activeModels.forEach(async (model) => {
        try {
          let text = "";
          if (model.id === 'CHATGPT') {
            const res = await openai.chat.completions.create({ model: 'gpt-4-turbo', messages: [{role: 'user', content: postData.content}] });
            text = res.choices[0].message.content || "";
          } else if (model.id === 'CLAUDE') {
            const res = await anthropic.messages.create({ model: 'claude-3-5-sonnet-20240620', max_tokens: 1024, messages: [{role: 'user', content: postData.content}] });
            text = res.content[0].type === 'text' ? res.content[0].text : "";
          } else if (model.id === 'DEEPSEEK') {
            const res = await deepseek.chat.completions.create({ model: 'deepseek-chat', messages: [{role: 'user', content: postData.content}] });
            text = res.choices[0].message.content || "";
          }
          io.emit('ai:response', { id: crypto.randomUUID(), name: model.name, content: text, sender: 'ai' });
        } catch (e) { console.error(e); }
      });

      if (user.role !== 'GOD_MODE') {
        await prisma.user.update({ where: { id: user.id }, data: { token_balance: { decrement: 1 } } });
      }
    } catch (err) { console.error(err); }
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Live on ${PORT}`));
