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

dotenv.config();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

// --- AI CLIENTS ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

// --- MIDDLEWARE & CORS ---
const allowedOrigins = [
  'https://janusforge.ai', 
  'https://www.janusforge.ai', 
  /\.vercel\.app$/, // Trust all Vercel previews
  'http://localhost:3000'
];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// --- HEALTH CHECK (STOPS THE 404 WARNINGS) ---
app.get('/', (req, res) => {
  res.status(200).json({ status: "ONLINE", system: "Janus Forge Nexus" });
});

// --- SOCKET.IO: THE LEFT HEMISPHERE ---
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true },
  transports: ['polling', 'websocket'] // Ensure stability
});

io.on('connection', (socket) => {
  console.log('⚡ Nexus Connection Established');

  socket.on('post:new', async (postData) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: postData.userId } });
      if (!user || (user.role !== 'GOD_MODE' && user.token_balance < 1)) {
        socket.emit('error', { message: 'Insufficient energy.' });
        return;
      }

      // Broadcast user message
      io.emit('post:incoming', { 
        id: crypto.randomUUID(), 
        name: user.username, 
        content: postData.content, 
        sender: 'user' 
      });

      // Council response using the raw_call pattern
      const models = ['gpt-4-turbo', 'claude-3-5-sonnet-20240620', 'deepseek-chat'];
      
      models.forEach(async (modelId) => {
        try {
          let text = "Council silent.";
          if (modelId.includes('gpt')) {
            const res = await openai.chat.completions.create({ model: modelId, messages: [{role: 'user', content: postData.content}] });
            text = res.choices[0].message.content || "";
          }
          // Emit each response as it arrives
          io.emit('ai:response', { id: crypto.randomUUID(), name: modelId, content: text, sender: 'ai' });
        } catch (err) { console.error(`❌ ${modelId} failed`, err); }
      });

      // Deduct token if not God Mode
      if (user.role !== 'GOD_MODE') {
        await prisma.user.update({ where: { id: user.id }, data: { token_balance: { decrement: 1 } } });
      }
    } catch (err) { console.error('Summoning Error:', err); }
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Nexus Backend Live on Port ${PORT}`));
