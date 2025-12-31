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

// --- 🛡️ ROBUST UNIVERSAL CORS MIDDLEWARE ---
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));

app.use(express.json());

// --- 🔑 AUTHENTICATION & SECURITY ---

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, email, password_hash: hashedPassword, tokens_remaining: 10, digest_subscribed: true }
    });
    res.status(201).json({ id: user.id, username: user.username, email: user.email });
  } catch (error: any) { res.status(400).json({ error: "Username or Email already in use." }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Unauthorized" });
    res.json({ id: user.id, email: user.email, username: user.username, role: user.role, tokens_remaining: user.tokens_remaining });
  } catch (error: any) { res.status(500).json({ error: "Auth Failure" }); }
});

// --- 🗝️ FORGOT & RESET PASSWORD LOGIC ---

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
      html: `<div style="background-color: #000; color: #fff; padding: 40px; font-family: sans-serif;">
                <h1>Janus Forge Nexus</h1>
                <p>Reset link: https://janusforge.ai/reset-password?token=${token}</p>
              </div>`
    });
    res.json({ message: "Reset link sent." });
  } catch (error: any) {
    logApiError('RESEND_MAIL', error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Token and Password are required." });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await prisma.user.updateMany({
      where: { reset_token: token, reset_expires: { gt: new Date() } },
      data: { password_hash: hashedPassword, reset_token: null, reset_expires: null }
    });
    if (result.count === 0) return res.status(400).json({ error: "Invalid or expired recovery token." });
    res.json({ success: true, message: "Credentials successfully updated. You may now log in." });
  } catch (error: any) {
    logApiError('PASSWORD_RESET_EXECUTION', error);
    res.status(500).json({ error: "Finalizing reset failed due to a server error." });
  }
});

// --- 💳 STRIPE CHECKOUT ROUTE (WITH ALIAS) ---
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
  } catch (error: any) {
    logApiError('STRIPE_CHECKOUT', error);
    res.status(500).json({ error: "Stripe connection failed" });
  }
});

// Webhook for Stripe completion
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET as string);
  } catch (error: any) {
    logApiError('STRIPE_WEBHOOK', error);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const userId = session.metadata.userId;
    const amount = parseInt(session.metadata.tokens) || 50;
    await prisma.user.update({
      where: { id: userId },
      data: { purchased_tokens: { increment: amount }, tokens_remaining: { increment: amount } }
    });
  }
  res.json({ received: true });
});

// --- 🛰️ DYNAMIC DAILY FORGE STATUS [REFINED & BULLETPROOF] ---
app.get('/api/daily-forge/status', async (req, res) => {
  try {
    const latestForge = await prisma.dailyForge.findFirst({
      orderBy: { created_at: 'desc' }
    });

    const nextReset = new Date();
    nextReset.setUTCHours(24, 0, 0, 0); // Sync to UTC midnight

    // Use flexible field mapping to prevent 500 crashes if schema names vary slightly
    res.json({
      topic: latestForge?.topic || "Neural Link Pending...",
      scoutQuote: (latestForge as any)?.scout_quote || (latestForge as any)?.scoutQuote || "The Scout is on patrol...",
      councilQuote: (latestForge as any)?.council_quote || (latestForge as any)?.councilQuote || "The Council is analyzing...",
      nextReset: nextReset.toISOString()
    });
  } catch (error: any) {
    logApiError('FORGE_STATUS_FETCH', error);
    res.status(500).json({ error: "Failed to sync Forge status" });
  }
});

app.get('/', (req, res) => { res.status(200).json({ status: "ONLINE" }); });
app.use('/api/daily-forge', dailyForgeRouter);

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  transports: ['polling', 'websocket']
});

io.on('connection', (socket) => {
  socket.on('post:new', async (postData) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: postData.userId } });
      if (!user || (user.role !== 'GOD_MODE' && user.tokens_remaining < 1)) return;
      io.emit('post:incoming', { id: crypto.randomUUID(), name: user.username, content: postData.content, sender: 'user' });
      const activeModels = [{ id: 'CHATGPT', name: 'GPT-4 (Architect)' }, { id: 'CLAUDE', name: 'Claude (Analyst)' }, { id: 'DEEPSEEK', name: 'DeepSeek (Logic)' }];
      activeModels.forEach(async (model) => {
        try {
          let text = "";
          if (model.id === 'CHATGPT') {
            const res = await openai.chat.completions.create({ model: 'gpt-4-turbo', messages: [{role: 'user', content: postData.content}] });
            text = res.choices[0].message.content || "";
          } else if (model.id === 'CLAUDE') {
            const res = await anthropic.messages.create({ model: 'claude-opus-4-5-20251101', max_tokens: 1024, messages: [{role: 'user', content: postData.content}] });
            text = res.content[0].type === 'text' ? res.content[0].text : "";
          } else if (model.id === 'DEEPSEEK') {
            const res = await deepseek.chat.completions.create({ model: 'deepseek-chat', messages: [{role: 'user', content: postData.content}] });
            text = res.choices[0].message.content || "";
          }
          io.emit('ai:response', { id: crypto.randomUUID(), name: model.name, content: text, sender: 'ai' });
        } catch (error: any) { logApiError(`AI_COUNCIL_${model.id}`, error); }
      });
      if (user.role !== 'GOD_MODE') {
        await prisma.user.update({ where: { id: user.id }, data: { tokens_remaining: { decrement: 1 }, tokens_used: { increment: 1 } } });
      }
    } catch (error: any) { console.error(error); }
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Live on ${PORT}`));
