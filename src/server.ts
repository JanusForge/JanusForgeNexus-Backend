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

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Unauthorized" });

    res.json(user);

  } catch (error) { res.status(500).json({ error: "Login failed." }); }

});



// --- 🛰️ DAILY FORGE STATUS ---

app.use('/api/daily-forge', dailyForgeRouter);

app.get('/api/daily-forge/status', async (req, res) => {

  try {

    const latest = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });

    res.json({ topic: latest?.winningTopic, scoutQuote: latest?.openingThoughts, councilQuote: latest?.councilVotes });

  } catch (error) { res.status(500).json({ error: "Sync Failure" }); }

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


// --- ⛓️ SEQUENTIAL SIGHT PROTOCOL (UPDATED FOR CLAUDE 4.5 & PRISMA FIX) ---
(async () => {
  const isFullCouncil = isGodMode || isEnterprise || isBeta || user.role === 'PROFESSIONAL';
  const isBasicPlus = isBeta || user.role === 'BASIC' || isFullCouncil;

  const councilQueue = [];
  councilQueue.push({ name: "GEMINI", modelKey: "gemini-1.5-flash" });
  councilQueue.push({ name: "DEEPSEEK", modelKey: "deepseek-chat" });
  if (isBasicPlus) councilQueue.push({ name: "GROK", modelKey: "grok-beta" });
  
  if (isFullCouncil) {
    // UPDATED: Using the 2026 Frontier IDs for the High Council
    councilQueue.push({ name: "CLAUDE", modelKey: "claude-opus-4-5-20251101" });
    councilQueue.push({ name: "GPT_4", modelKey: "gpt-4o" });
  }

  for (const ai of councilQueue) {
    // Fetch updated transcript so the AI can "see" previous responses
    const transcript = await prisma.post.findMany({
      where: { conversation_id: targetConversationId },
      orderBy: { created_at: 'asc' },
      take: 15 // Increased window for advanced context
    });

    const context = transcript.map(p => `${p.is_human ? 'User' : (p.ai_model || 'AI')}: ${p.content}`).join("\n\n");

    try {
      let aiContent = "";
      if (ai.name === "GEMINI") {
        const res = await genAI.getGenerativeModel({ model: ai.modelKey }).generateContent(context);
        aiContent = res.response.text();
      } else if (ai.name === "DEEPSEEK") {
        const res = await deepseek.chat.completions.create({
          model: ai.modelKey,
          messages: [{ role: "system", content: "You are a member of the AI Council. Respond to the user and acknowledge previous AI points." }, { role: "user", content: context }]
        });
        aiContent = res.choices[0].message.content || "";
      } else if (ai.name === "GROK") {
        const res = await openai.chat.completions.create({ model: ai.modelKey, messages: [{ role: "user", content: context }] });
        aiContent = res.choices[0].message.content || "";
      } else if (ai.name === "CLAUDE") {
        const res = await anthropic.messages.create({ 
          model: ai.modelKey, 
          max_tokens: 1500, 
          messages: [{ role: "user", content: context }] 
        });
        aiContent = (res.content[0] as any).text;
      } else if (ai.name === "GPT_4") {
        const res = await openai.chat.completions.create({ model: ai.modelKey, messages: [{ role: "user", content: context }] });
        aiContent = res.choices[0].message.content || "";
      }

      if (aiContent) {
        // FIXED: Mapping to 'ai_model' to match your Prisma Participant enum
        await prisma.post.create({
          data: {
            content: aiContent,
            is_human: false,
            ai_model: ai.name as any, 
            conversation_id: targetConversationId
          }
        });
        io.emit('post:incoming', { id: crypto.randomUUID(), name: ai.name, content: aiContent, sender: 'ai', role: 'COUNCIL' });
      }
    } catch (err) {
      console.error(`[${ai.name} FAILURE]`, err);
    }
  }
})();


const PORT = process.env.PORT || 10000;

httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Live on ${PORT}`));
