import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient, UserRole, AIParticipant } from '@prisma/client';
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

// --- 🛡️ CORS MIDDLEWARE ---
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));

app.use(express.json());

// --- 🔑 AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, referralCode = "" } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const isBeta = referralCode.trim().toUpperCase() === 'BETA_2026';
    const startTokens = isBeta ? 50 : 10;
    const userRole = isBeta ? UserRole.BETA_ARCHITECT : UserRole.USER;

    console.log(`[SYS] Initializing Profile: ${email} | Role: ${userRole} | Tokens: ${startTokens}`);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password_hash: hashedPassword,
        role: userRole,
        tokens_remaining: startTokens,
        token_balance: startTokens,
        digest_subscribed: true
      }
    });

    res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      tokens_remaining: user.tokens_remaining
    });
  } catch (error: any) {
    console.error("Registration Error:", error);
    res.status(400).json({ error: "Username or Email already in use." });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Unauthorized" });
    res.json({ id: user.id, email: user.email, username: user.username, role: user.role, tokens_remaining: user.tokens_remaining });
  } catch (error: any) { res.status(500).json({ error: "Auth Failure" }); }
});

// --- 🗝️ PASSWORD RECOVERY ---
app.post(['/api/auth/forgot-password', '/api/auth/forgotpassword'], async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: "Check your email for reset instructions." });
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    await prisma.user.update({ where: { email }, data: { reset_token: token, reset_expires: expires } });
    await resend.emails.send({
      from: 'Janus Forge <admin@janusforge.ai>',
      to: email,
      subject: 'Access Recovery: Janus Forge Nexus',
      html: `<div style="background-color: #000; color: #fff; padding: 40px; font-family: sans-serif;"><h1>Janus Forge Nexus</h1><p>Reset link: https://janusforge.ai/reset-password?token=${token}</p></div>`
    });
    res.json({ message: "Reset link sent." });
  } catch (error: any) { logApiError('RESEND_MAIL', error); res.status(500).json({ error: "Failed to process request" }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await prisma.user.updateMany({
      where: { reset_token: token, reset_expires: { gt: new Date() } },
      data: { password_hash: hashedPassword, reset_token: null, reset_expires: null }
    });
    if (result.count === 0) return res.status(400).json({ error: "Invalid or expired recovery token." });
    res.json({ success: true, message: "Credentials updated." });
  } catch (error: any) { res.status(500).json({ error: "Reset failed." }); }
});

// --- 💳 STRIPE & WEBHOOKS ---
app.post(['/api/stripe/create-checkout-session', '/api/v1/billing/checkout'], async (req, res) => {
  const { priceId, userId } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/dashboard?success=true`,
      cancel_url: `${process.env.CLIENT_URL}/pricing?canceled=true`,
      metadata: { userId },
    });
    res.json({ id: session.id, url: session.url });
  } catch (error: any) { res.status(500).json({ error: "Stripe connection failed" }); }
});

app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET as string);
  } catch (error: any) { return res.status(400).send(`Webhook Error: ${error.message}`); }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const userId = session.metadata.userId;
    const amount = parseInt(session.metadata.tokens) || 50;
    await prisma.user.update({ where: { id: userId }, data: { tokens_remaining: { increment: amount } } });
  }
  res.json({ received: true });
});

// --- 🛰️ DAILY FORGE ROUTER ---
app.use('/api/daily-forge', dailyForgeRouter);

// Root Status
app.get('/api/daily-forge/status', async (req, res) => {
  try {
    const latestForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
    const nextReset = new Date();
    nextReset.setUTCHours(24, 0, 0, 0);
    if (!latestForge) return res.json({ topic: "Pending...", scoutQuote: "Scouting...", councilQuote: "Analyzing...", nextReset: nextReset.toISOString() });
    res.json({ topic: latestForge.winningTopic, scoutQuote: latestForge.openingThoughts, councilQuote: latestForge.councilVotes, nextReset: nextReset.toISOString() });
  } catch (error) { res.status(500).json({ error: "Sync Error" }); }
});

app.get('/', (req, res) => {
  res.status(200).json({ status: "ONLINE", timestamp: new Date().toISOString() });
});

// --- 🏛️ REAL-TIME ADVERSARIAL DISCOURSE ---
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  connectionStateRecovery: {}
});

io.on('connection', (socket) => {
  console.log(`[SYS] Socket Connected: ${socket.id}`);

  socket.on('post:new', async (postData) => {
    try {
      const [user, activeConversation] = await Promise.all([
        prisma.user.findUnique({ where: { id: postData.userId } }),
        prisma.conversation.findFirst({
          where: { is_daily_forge: true },
          orderBy: { created_at: 'desc' }
        })
      ]);

      if (!activeConversation) throw new Error("No active Forge stream detected.");

      // Founder/Architects are charged tokens unless role is specifically GOD_MODE
      const isGodMode = user?.role === UserRole.GOD_MODE;

      if (!user || (!isGodMode && user.tokens_remaining < 1)) {
        socket.emit('error', { message: "The Forge requires tribute (tokens) to enter." });
        return;
      }

      // 1. ATOMIC TRANSACTION: Save the interjection
      const savedPost = await prisma.$transaction(async (tx) => {
        let currentTokens = user.tokens_remaining;
        if (!isGodMode) {
          const updatedUser = await tx.user.update({
            where: { id: user.id },
            data: { tokens_remaining: { decrement: 1 } }
          });
          currentTokens = updatedUser.tokens_remaining;
        }

        const post = await tx.post.create({
          data: {
            content: postData.content,
            is_human: true,
            user_id: user.id,
            conversation_id: activeConversation.id
          }
        });
        return { post, currentTokens };
      });

      // 2. IMMEDIATE BROADCAST: Stop the local spinner
      io.emit('post:incoming', {
        id: savedPost.post.id,
        name: user.username,
        content: savedPost.post.content,
        sender: 'user',
        role: user.role,
        tokens_remaining: savedPost.currentTokens
      });

      // 3. 🛰️ COUNCIL SYNTHESIS: Trigger AI Participants
      console.log(`[STIMULUS] Human interjection saved. Triggering Council response: ${savedPost.post.id}`);

      // Async IIFE to prevent blocking the socket
      (async () => {
        try {
          // Gemini Response Heartbeat
          const geminiModel = genAI.getGenerativeModel({ model: "gemini-pro" });
          const geminiResult = await geminiModel.generateContent(`As a member of the Council of Synthesis, respond briefly to this interjection in the context of the 2026 judicial AI debate: "${postData.content}"`);
          const geminiText = geminiResult.response.text();

          io.emit('post:incoming', {
            id: crypto.randomUUID(),
            name: "GEMINI_PRO",
            content: geminiText,
            sender: 'ai',
            role: 'COUNCIL'
          });

          // Claude Response Heartbeat
          const claudeResponse = await anthropic.messages.create({
            model: "claude-3-opus-20240229",
            max_tokens: 300,
            messages: [{ role: "user", content: `Respond to: ${postData.content}` }],
          });
          
          // Logic for extracting Claude text content
          const claudeText = (claudeResponse.content[0] as any).text;

          io.emit('post:incoming', {
            id: crypto.randomUUID(),
            name: "CLAUDE",
            content: claudeText,
            sender: 'ai',
            role: 'COUNCIL'
          });

        } catch (aiError) {
          console.error("[COUNCIL ERROR]", aiError);
        }
      })();

    } catch (error: any) {
      console.error("[SYNTHESIS ERROR]", error);
      socket.emit('error', { message: "The Forge is cooling. Check your connection." });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[SYS] Socket Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Live on ${PORT}`));
