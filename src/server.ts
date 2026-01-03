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
import conversationRouter from './routes/conversations';

dotenv.config();
console.log('Auth routes loading...');

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
  apiKey: process.env.GROK_API_KEY,
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
  } catch (error) {
    res.status(400).json({ error: "Registration conflict." });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    console.log(`🔐 Login attempt for: ${email}`);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    console.log("✅ Login Success");
    res.json(user);
  } catch (error: any) {
    console.error("🔥 CRITICAL LOGIN ERROR:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


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
      if (!user) {
        socket.emit('error', { message: "User not found." });
        return;
      }
      const isGodMode = user.role === 'GOD_MODE';
      const isEnterprise = user.role === 'ENTERPRISE';
      const hasTokenBypass = isGodMode || isEnterprise;
      if (!hasTokenBypass && user.tokens_remaining < 1) {
        socket.emit('error', { message: "Nexus tokens required." });
        return;
      }

      // Determine target conversation
      let targetConversationId: string;
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
        targetConversationId = postData.conversationId || activeConversation?.id;
      }
      if (!targetConversationId) throw new Error("No active thread detected.");

      // Transaction: deduct token + save human post
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

      // Emit human message
      io.emit('post:incoming', {
        id: savedPost.id,
        name: user.username,
        content: savedPost.content,
        sender: 'user',
        role: user.role,
        tokens_remaining: currentTokens
      });

      // --- ⛓️ SEQUENTIAL SIGHT PROTOCOL ---
      (async () => {
        const councilDirective = "You are a member of the Janus Forge AI Council. You are currently in a real-time multiversal debate and conversation with other AIs and human users. Acknowledge fellow members and the Architect (Cassandra). Use the provided transcript to respond to previous points.";

        const isFullCouncil = isGodMode || isEnterprise || user.role === 'BETA_ARCHITECT' || user.role === 'PROFESSIONAL';
        const isBasicPlus = user.role === 'BETA_ARCHITECT' || user.role === 'BASIC' || isFullCouncil;

        const councilQueue = [];
        councilQueue.push({ name: "GEMINI", modelKey: "gemini-2.5-pro" });
        councilQueue.push({ name: "DEEPSEEK", modelKey: "deepseek-chat" });
        if (isBasicPlus) councilQueue.push({ name: "GROK", modelKey: "grok-4.1-fast" });
        if (isFullCouncil) {
          councilQueue.push({ name: "CLAUDE", modelKey: "claude-opus-4-5-20251101" });
          councilQueue.push({ name: "GPT_4", modelKey: "gpt-5.2" });
        }

        for (const ai of councilQueue) {
          const transcript = await prisma.post.findMany({
            where: { conversation_id: targetConversationId },
            orderBy: { created_at: 'asc' },
            take: 20
          });

          const context = transcript.map(p => {
            const name = p.is_human ? 'Architect (Cassandra)' : (p.ai_model || 'Council Member');
            return `${name}: ${p.content}`;
          }).join("\n") + "\n\nPRIORITIZE THIS LATEST DIRECTIVE FROM THE ARCHITECT: " + transcript[transcript.length - 1].content;

          try {
            let aiContent = "";
            if (ai.name === "GEMINI") {
              const geminiModels = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro"];
              aiContent = "[GEMINI unavailable]";
              for (const modelName of geminiModels) {
                try {
                  const model = genAI.getGenerativeModel({ model: modelName });
                  const res = await model.generateContent(context);
                  aiContent = res.response.text();
                  console.log(`GEMINI success with ${modelName}`);
                  break;
                } catch (err) {
                  console.warn(`GEMINI failed with ${modelName}:`, err.message || err);
                }
              }
            } else if (ai.name === "DEEPSEEK") {
              const res = await deepseek.chat.completions.create({
                model: "deepseek-chat",
                messages: [{ role: "system", content: councilDirective }, { role: "user", content: context }]
              });
              aiContent = res.choices[0].message.content || "";
            } else if (ai.name === "GROK") {
              const grokModels = ["grok-4.1-fast", "grok-beta", "grok-3", "grok-2"];
              aiContent = "[GROK unavailable]";
              for (const modelName of grokModels) {
                try {
                  const res = await xai.chat.completions.create({
                    model: modelName,
                    messages: [{ role: "system", content: councilDirective }, { role: "user", content: context }]
                  });
                  aiContent = res.choices[0].message.content || "";
                  console.log(`GROK success with ${modelName}`);
                  break;
                } catch (err) {
                  console.warn(`GROK failed with ${modelName}:`, err.message || err);
                }
              }
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
                messages: [{ role: "system", content: councilDirective }, { role: "user", content: context }]
              });
              aiContent = res.choices[0].message.content || "";
            }

            if (aiContent) {
              const aiPost = await prisma.post.create({
                data: {
                  content: aiContent,
                  is_human: false,
                  ai_model: ai.name as any,
                  conversation_id: targetConversationId
                }
              });
              io.emit('post:incoming', {
                id: aiPost.id,
                name: ai.name,
                content: aiContent,
                sender: 'ai',
                tokens_remaining: currentTokens
              });
              await new Promise(r => setTimeout(r, 1500));
              console.log(`📡 [Nexus Sync] ${ai.name} response settled. Moving to next Council member...`);
            }
          } catch (err) {
            console.error(`[${ai.name} FAILURE]`, err);
            io.emit('post:incoming', {
              id: crypto.randomUUID(),
              name: ai.name,
              content: `[${ai.name} temporarily unavailable – council continues]`,
              sender: 'ai',
              tokens_remaining: currentTokens
            });
          }
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
