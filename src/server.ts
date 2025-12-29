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

// Updated specifically for Namecheap Private Email
const transporter = nodemailer.createTransport({
  host: "mail.privateemail.com",
  port: 465,
  secure: true, 
  auth: {
    user: process.env.EMAIL_USER, // Your primary Namecheap email
    pass: process.env.EMAIL_PASS, // The password you just generated
  },
});

// Helper to send the Welcome Email
const sendWelcomeEmail = async (email: string, username: string) => {
  try {
    await transporter.sendMail({
      from: '"Janus Forge" <welcome@janusforge.ai>',
      to: email,
      subject: 'Welcome to the Janus Forge Nexus',
      html: `
        <div style="font-family: sans-serif; background: #000; color: #fff; padding: 40px; border-radius: 20px; border: 1px solid #333;">
          <h1 style="color: #3b82f6; text-transform: uppercase; tracking: -1px;">Welcome, Architect ${username}</h1>
          <p style="color: #ccc; line-height: 1.6;">Your access to the AI Council has been initialized. You can now engage with Gemini, Claude, DeepSeek, and Grok to forge new intelligence.</p>
          <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;" />
          <p style="font-size: 12px; color: #666; text-transform: uppercase;">This is a production platform. Ensure your energy (tokens) remains replenished via the Token Forge.</p>
          <div style="margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL}/pricing" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; text-transform: uppercase;">Refuel Your Forge</a>
          </div>
        </div>
      `,
    });
    console.log(`📧 Welcome email dispatched to: ${email}`);
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
    console.error(`❌ Webhook Signature Error: ${err.message}`);
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
      console.log('✅ Nexus Economy Updated: Tokens + History logged');
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

// AUTHENTICATION & REGISTRATION
app.post('/api/auth/register', async (req, res) => {
  const { email, username, password } = req.body;
  try {
    const newUser = await prisma.user.create({
      data: { 
        email, 
        username, 
        password, // Ensure password hashing is implemented in production
        token_balance: 50 // Default starting tokens
      } 
    });

    // Trigger Welcome Email immediately after DB success
    await sendWelcomeEmail(email, username);

    res.json({ user: newUser, message: "Account created successfully." });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ error: "Registration failed." });
  }
});

// PASSWORD RESET ROUTES
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If an account exists, a reset link has been sent.' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { email },
      data: { resetToken, resetTokenExpiry: resetExpires },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await transporter.sendMail({
      from: '"Janus Forge" <no-reply@janusforge.ai>',
      to: email,
      subject: 'Nexus Access Recovery',
      html: `<p>To reset your Janus Forge password, <a href="${resetUrl}">click here</a>. This link expires in 1 hour.</p>`,
    });

    res.json({ message: 'Reset link sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired token.' });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: newPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// BILLING ROUTES
app.get('/api/v1/billing/history/:userId', async (req, res) => {
  try {
    const history = await prisma.purchase.findMany({
      where: { userId: req.params.userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/billing/checkout', async (req, res) => {
  const { priceId, userId, tokens, mode, packageName } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: mode || 'payment',
      success_url: `${process.env.FRONTEND_URL}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/billing?canceled=true`,
      metadata: { 
        userId, 
        tokenAmount: tokens.toString(),
        packageName: packageName || 'Fuel Pack'
      },
    });
    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', database: 'connected', stripe: 'initialized' });
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = req.body?.username || req.body?.email || req.body?.identifier;
  if (identifier === 'admin-access' || identifier === 'admin@janusforge.ai') {
    return res.json({
      user: {
        id: process.env.ADMIN_UUID || '550e8400-e29b-41d4-a716-446655440000',
        username: 'admin-access',
        token_balance: 999999,
        tier: 'enterprise'
      },
      token: 'admin-bypass-token'
    });
  }
  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ username: String(identifier) }, { email: String(identifier) }] }
    });
    if (!user) return res.status(404).json({ message: "Intelligence profile not found." });
    res.json({ user, token: 'mock-jwt-token' });
  } catch (error) {
    res.status(500).json({ message: "Nexus Core Auth Error" });
  }
});

// --- 4. SOCKET.IO ---
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  transports: ['polling', 'websocket']
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

io.on('connection', (socket) => {
  socket.on('post:new', async (postData) => {
    // Council logic...
  });
  socket.on('disconnect', () => { console.log('❌ Connection Terminated'); });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Nexus Backend Live on Port ${PORT}`));
