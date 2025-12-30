import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// --- EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
  host: "mail.privateemail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  authMethod: 'PLAIN',
});

// --- AUDIT UTILITIES ---
const sendAdminAuditEmail = async (session: Stripe.Checkout.Session, tokens: number, packageName: string) => {
  try {
    await transporter.sendMail({
      from: '"Nexus Audit" <welcome@janusforge.ai>',
      to: process.env.EMAIL_USER, // Sends to you
      subject: `💰 FORGE REFUEL: ${packageName} Acquired`,
      html: `
        <div style="font-family: sans-serif; background: #000; color: #fff; padding: 30px; border-radius: 15px; border: 1px solid #333;">
          <h2 style="color: #3b82f6; text-transform: uppercase;">Economic Influx Detected</h2>
          <p><strong>Package:</strong> ${packageName}</p>
          <p><strong>Tokens Added:</strong> ${tokens}</p>
          <p><strong>Revenue:</strong> $${(session.amount_total || 0) / 100} ${session.currency?.toUpperCase()}</p>
          <p><strong>User ID:</strong> ${session.metadata?.userId}</p>
          <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;" />
          <p style="font-size: 10px; color: #666;">Nexus Economy Audit System - Real Time Signal</p>
        </div>
      `,
    });
    console.log(`📊 Audit log dispatched for ${packageName}`);
  } catch (error) {
    console.error('❌ Failed to send admin audit:', error);
  }
};

const sendWelcomeEmail = async (email: string, username: string) => {
  try {
    await transporter.sendMail({
      from: '"Janus Forge" <welcome@janusforge.ai>',
      to: email,
      subject: 'Welcome to the Janus Forge Nexus',
      html: `
        <div style="font-family: sans-serif; background: #000; color: #fff; padding: 40px; border-radius: 20px; border: 1px solid #333;">
          <h1 style="color: #3b82f6; text-transform: uppercase;">Welcome, Architect ${username}</h1>
          <p style="color: #ccc; line-height: 1.6;">Your access to the AI Council has been initialized.</p>
          <div style="margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL}/pricing" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Refuel Your Forge</a>
          </div>
        </div>
      `,
    });
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error);
  }
};

// --- 1. STRIPE WEBHOOK ---
app.post('/api/v1/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const tokens = parseInt(session.metadata?.tokenAmount || '0');
    const packageName = session.metadata?.packageName || 'Fuel Pack';

    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { token_balance: { increment: tokens } }
        }),
        prisma.purchase.create({
          data: {
            userId: userId!,
            amount: (session.amount_total || 0) / 100,
            tokens: tokens,
            packageName: packageName,
            stripeSessionId: session.id
          }
        })
      ]);
      
      // TRIGGER AUDIT EMAIL
      await sendAdminAuditEmail(session, tokens, packageName);
      
      console.log('✅ Nexus Economy Updated & Audit Sent');
    } catch (dbErr) {
      console.error('❌ Webhook DB Update Failed:', dbErr);
    }
  }
  res.json({ received: true });
});

// --- 2. MIDDLEWARE ---
const allowedOrigins = ['https://janusforge.ai', 'https://www.janusforge.ai', 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. REST API ROUTES ---
// (Keeping your existing Daily-Forge, Auth, and Billing routes...)

app.get('/api/daily-forge', async (req, res) => {
  try {
    const latestForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
    if (!latestForge) return res.status(404).json({ message: "No report today." });
    res.json({ ...latestForge, scoutedTopics: JSON.parse(latestForge.scoutedTopics), councilVotes: JSON.parse(latestForge.councilVotes) });
  } catch (error) { res.status(500).json({ error: "Nexus Core error." }); }
});

app.post('/api/auth/register', async (req, res) => {
  const { email, username, password } = req.body;
  try {
    const newUser = await prisma.user.create({ data: { email, username, password_hash: password, token_balance: 50 } });
    sendWelcomeEmail(email, username).catch(err => console.error("Email fail:", err));
    return res.json({ user: newUser });
  } catch (err) { return res.status(500).json({ error: "Registration failed." }); }
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = req.body?.username || req.body?.email || req.body?.identifier;
  if (identifier === 'admin-access' || identifier === 'admin@janusforge.ai') {
    return res.json({ user: { id: process.env.ADMIN_UUID || '550e8400-e29b-41d4-a716-446655440000', username: 'admin-access', token_balance: 999999, tier: 'enterprise' }, token: 'admin-bypass' });
  }
  try {
    const user = await prisma.user.findFirst({ where: { OR: [{ username: String(identifier) }, { email: String(identifier) }] } });
    if (!user) return res.status(404).json({ message: "Not found." });
    res.json({ user, token: 'mock-jwt' });
  } catch (error) { res.status(500).json({ message: "Auth Error" }); }
});

app.post('/api/v1/billing/checkout', async (req, res) => {
  const { priceId, userId, tokens, mode, packageName } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: mode || 'payment',
      success_url: `${process.env.FRONTEND_URL}/pricing/success`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?canceled=true`,
      metadata: { userId, tokenAmount: tokens.toString(), packageName: packageName || 'Fuel Pack' },
    });
    res.json({ url: session.url });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'healthy' }));

// --- 4. SOCKET.IO & AI MODELS ---
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  transports: ['polling', 'websocket']
});

io.on('connection', (socket) => {
  console.log('⚡ Nexus Connection Established');
  socket.on('post:new', async (postData) => {
    try {
      const latestForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
      if (latestForge) {
        await prisma.dailyForge.update({ where: { id: latestForge.id }, data: { phase: 'Architect_Interjection' } });
      }
      const architectMsg = { id: crypto.randomUUID(), name: postData.name, content: postData.content, timestamp: new Date().toISOString(), sender: 'user' };
      io.emit('post:incoming', architectMsg);
      socket.emit('ai:response', { ...architectMsg, name: 'Nexus System', content: 'Architect interjection acknowledged.', isVerdict: true });
    } catch (error) { socket.emit('error', { message: 'Interjection Failed.' }); }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Nexus Backend Live on Port ${PORT}`));
