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
const xai = new OpenAI({
  apiKey: process.env.GROK_API_KEY,        // ← Matches your .env and Render var
  baseURL: 'https://api.x.ai/v1'
});

app.use(cors({ origin: (origin, callback) => callback(null, true), credentials: true }));
app.use(express.json());

// --- 🔑 AUTH & TIERED LEDGER ---
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
    console.log(`🔐 Login attempt for: ${email}`);
    
    // Normalize email to prevent case-sensitivity issues
    const user = await prisma.user.findUnique({ 
      where: { email: email.toLowerCase() } 
    });

    if (!user) {
      console.error("❌ Login Fail: User not found in database.");
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Explicitly check if password_hash exists
    if (!user.password_hash) {
      console.error("❌ Login Fail: User has no stored password hash.");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      console.error("❌ Login Fail: Password mismatch.");
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log("✅ Login Success: Issuing Token...");
    
    // Ensure JWT_SECRET is present or provide a fallback for testing
    const secret = process.env.JWT_SECRET || 'fallback-secret-change-me';
    // ... generate token logic ...
    
    res.json(user);
  } catch (error: any) {
    console.error("🔥 CRITICAL LOGIN ERROR:", error.message);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});


// --- 🛰️ DAILY FORGE STATUS ---
app.use('/api/daily-forge', dailyForgeRouter);

app.get('/api/daily-forge/status', async (req, res) => {
  try {
    // Attempt a quick find with a limit to minimize load
    const latest = await prisma.dailyForge.findFirst({ 
      orderBy: { date: 'desc' } 
    });

    if (!latest) {
      return res.status(200).json({
        topic: "Initializing Synthesis...",
        scoutQuote: "Scout is currently patrolling...",
        councilQuote: "Waiting for Council to convene."
      });
    }

    res.json({ 
      topic: latest.winningTopic, 
      scoutQuote: latest.openingThoughts, 
      councilQuote: latest.councilVotes,
      nextReset: latest.date 
    });
  } catch (error: any) {
    // This logs the EXACT reason for the 500 error in your Render logs
    console.error("CRITICAL: Daily Forge Status Fetch Failure", {
      message: error.message,
      code: error.code
    });
    res.status(500).json({ error: "Sync Failure", details: error.message });
  }
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

      const isGodMode = user?.role === 'GOD_MODE';
      const isEnterprise = user?.role === 'ENTERPRISE';
      const isBeta = user?.role === 'BETA_ARCHITECT';
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

      io.emit('post:incoming', {
        id: savedPost.id,
        name: user.username,
        content: savedPost.content,
        sender: 'user',
        role: user.role,
        tokens_remaining: hasTokenBypass ? 999999 : user.tokens_remaining - 1
      });

// --- ⛓️ SEQUENTIAL SIGHT PROTOCOL ---
(async () => {
  const councilDirective = "You are a member of the Janus Forge AI Council. You are currently in a real-time multiversal debate and conversation with other AIs and human users. Acknowledge fellow members and the Architect (Cassandra). Use the provided transcript to respond to previous points.";
  const isFullCouncil = isGodMode || isEnterprise || isBeta || user.role === 'PROFESSIONAL';
  const isBasicPlus = isBeta || user.role === 'BASIC' || isFullCouncil;

  const councilQueue = [];
  councilQueue.push({ name: "GEMINI", modelKey: "gemini-1.5-flash" });
  councilQueue.push({ name: "DEEPSEEK", modelKey: "deepseek-chat" });
  if (isBasicPlus) councilQueue.push({ name: "GROK", modelKey: "grok-beta" });

  if (isFullCouncil) {
    councilQueue.push({ name: "CLAUDE", modelKey: "claude-opus-4-5-20251101" });
    councilQueue.push({ name: "GPT_4", modelKey: "gpt-4o" });
  }

  for (const ai of councilQueue) {
    // 1. RE-FETCH TRANSCRIPT: Every AI needs the absolute latest view of the chat
    const transcript = await prisma.post.findMany({
      where: { conversation_id: targetConversationId },
      orderBy: { created_at: 'asc' },
      take: 20 
    });

    // 2. CONTEXT SYNTHESIS: Format for cross-AI recognition
    const context = transcript.map(p => {
      const name = p.is_human ? 'Architect (Cassandra)' : (p.ai_model || 'Council Member');
      return `${name}: ${p.content}`;
    }).join("\n");

    try {
      let aiContent = "";

      // --- 🧠 AI BRAIN LOGIC ---
      if (ai.name === "GEMINI") {
        const model = genAI.getGenerativeModel({ model: ai.modelKey, systemInstruction: councilDirective });
        const res = await model.generateContent(context);
        aiContent = res.response.text();

      } else if (ai.name === "DEEPSEEK") {
        const res = await deepseek.chat.completions.create({
          model: ai.modelKey,
          messages: [
            { role: "system", content: councilDirective },
            { role: "user", content: context }
          ]
        });
        aiContent = res.choices[0].message.content || "";

      } else if (ai.name === "GROK") {
        const res = await xai.chat.completions.create({ // Ensure xai client is initialized
          model: ai.modelKey,
          messages: [
            { role: "system", content: councilDirective },
            { role: "user", content: context }
          ]
        });
        aiContent = res.choices[0].message.content || "";

      } else if (ai.name === "CLAUDE") {
        const res = await anthropic.messages.create({
          model: ai.modelKey,
          max_tokens: 1500,
          system: councilDirective,
          messages: [{ role: "user", content: context }]
        });
        aiContent = (res.content[0] as any).text;

      } else if (ai.name === "GPT_4") {
        const res = await openai.chat.completions.create({
          model: ai.modelKey,
          messages: [
            { role: "system", content: councilDirective },
            { role: "user", content: context }
          ]
        });
        aiContent = res.choices[0].message.content || "";
      }

      if (aiContent) {
        // 3. SAVE TO DB: This must complete before the next AI starts
        await prisma.post.create({
          data: {
            content: aiContent,
            is_human: false,
            ai_model: ai.name as any,
            conversation_id: targetConversationId
          }
        });

        // 4. EMIT LIVE: Stream it to the UI
        io.emit('post:incoming', {
          id: crypto.randomUUID(),
          name: ai.name,
          content: aiContent,
          sender: 'ai'
        });

        // ⛓️ THE NEXUS SYNC: Wait 1.5s for DB/Socket stability
        await new Promise(r => setTimeout(r, 1500));
        console.log(`📡 [Nexus Sync] ${ai.name} response settled. Moving to next Council member...`);
      }
    } catch (err) {
      console.error(`[${ai.name} FAILURE]`, err);
    }
  }
// ... (Immediately after the end of your for-of councilQueue loop)
      })(); // Closes the (async () => {
    } catch (error: any) {
      io.emit('error', { message: "Channel Sync Lost." });
    }
  }); // Closes the io.on('chat:message', ...
}); // Closes the io.on('connection', ...

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Live on ${PORT}`));
