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
import dailyForgeRouter from './routes/dailyForge';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

// --- 🛰️ GLOBAL LOGGING UTILITY ---
const logApiError = (service: string, error: any) => {
  console.error(`\n[🚨 ${service} FAILURE] @ ${new Date().toISOString()}`);
  console.error(`- Message: ${error.message || 'No message provided'}`);
  if (error.status || error.statusCode) console.error(`- Status Code: ${error.status || error.statusCode}`);
  if (error.response?.data) console.error(`- Raw Data:`, JSON.stringify(error.response.data, null, 2));
  console.error(`---------------------------------------------------\n`);
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));

app.use(express.json());

// --- 🗝️ AUTH & SECURITY (STAYED THE SAME) ---
// ... (Register/Login/Reset Logic remains identical)

// --- 🛰️ DAILY FORGE: HISTORY & ARCHIVES ---
app.get('/api/daily-forge/history', async (req, res) => {
  try {
    const history = await prisma.dailyForge.findMany({
      where: { 
        phase: 'COUNCIL_DEBATE' // Only show completed syntheses
      },
      orderBy: { date: 'desc' },
      skip: 1 // Skip the current active one
    });
    res.json(history);
  } catch (error: any) {
    logApiError('HISTORY_FETCH', error);
    res.status(500).json({ error: "Failed to retrieve archives." });
  }
});

// --- 🎙️ ARCHITECT INTERJECTION (TOKENIZED) ---
app.post('/api/daily-forge/interject', async (req, res) => {
  const { userId, content } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user || (user.role !== 'GOD_MODE' && user.tokens_remaining < 1)) {
      return res.status(403).json({ error: "Insufficient Authority/Tokens." });
    }

    // 1. Deduct Token if not GOD_MODE
    if (user.role !== 'GOD_MODE') {
      await prisma.user.update({
        where: { id: userId },
        data: { tokens_remaining: { decrement: 1 }, tokens_used: { increment: 1 } }
      });
    }

    // 2. Broadcast the Interjection to the Live Debate stream
    io.emit('post:incoming', {
      id: crypto.randomUUID(),
      name: user.username,
      content: content,
      sender: 'user',
      isInterjection: true
    });

    // 3. Trigger Council Reaction
    const forge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
    const context = `Human observer ${user.username} has interjected with: "${content}". 
                     Adjust your current synthesis of "${forge?.winningTopic}" to address this directive.`;

    const activeModels = [
      { id: 'CLAUDE', name: 'Claude (Analyst)', model: 'claude-opus-4-5-20251101' },
      { id: 'CHATGPT', name: 'GPT-4 (Architect)', model: 'gpt-4-turbo' }
    ];

    activeModels.forEach(async (m) => {
      try {
        let text = "";
        if (m.id === 'CLAUDE') {
          const r = await anthropic.messages.create({ 
            model: m.model, 
            max_tokens: 500, 
            messages: [{ role: 'user', content: context }] 
          });
          text = r.content[0].type === 'text' ? r.content[0].text : "";
        } else if (m.id === 'CHATGPT') {
          const r = await openai.chat.completions.create({ 
            model: m.model, 
            messages: [{ role: 'user', content: context }] 
          });
          text = r.choices[0].message.content || "";
        }
        io.emit('ai:response', { id: crypto.randomUUID(), name: m.name, content: text, sender: 'ai' });
      } catch (err) { logApiError(`INTERJECTION_REACTION_${m.id}`, err); }
    });

    res.json({ success: true });
  } catch (error: any) {
    logApiError('INTERJECTION_FAILURE', error);
    res.status(500).json({ error: "Transmission failed." });
  }
});

// --- 🛰️ DYNAMIC DAILY FORGE STATUS (UNTOUCHED) ---
app.get('/api/daily-forge/status', async (req, res) => {
  // ... (Your existing status logic)
});

app.get('/', (req, res) => { res.status(200).json({ status: "ONLINE" }); });
app.use('/api/daily-forge', dailyForgeRouter);

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  transports: ['polling', 'websocket']
});

// --- 🔌 SOCKET CONNECTION (EXISTING LOGIC) ---
io.on('connection', (socket) => {
  // ... (Your existing io.on logic)
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Live on ${PORT}`));
