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
import dailyForgeRouter from './routes/dailyForge';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

// --- AI CLIENTS ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

// --- MIDDLEWARE ---
const allowedOrigins = ['https://janusforge.ai', 'https://www.janusforge.ai', /\.vercel\.app$/, 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// --- 🔑 AUTHENTICATION & SECURITY ---

// 1. Register (FIXED: Added this route to prevent the HTML-as-JSON error)
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password_hash: hashedPassword,
        tokens_remaining: 10, // Default starting fuel
        digest_subscribed: true // Default opt-in
      }
    });
    res.status(201).json({
      id: user.id,
      email: user.email,
      username: user.username,
      tokens_remaining: user.tokens_remaining
    });
  } catch (err) {
    console.error("Registration Error:", err);
    res.status(400).json({ error: "User already exists or invalid data." });
  }
});

// 2. Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: "Unauthorized" });

    res.json({ 
      id: user.id, 
      email: user.email, 
      username: user.username, 
      role: user.role, 
      tokens_remaining: user.tokens_remaining,
      digest_subscribed: user.digest_subscribed 
    });
  } catch (err) { res.status(500).json({ error: "Auth Failure" }); }
});

// 3. Forgot Password (Branded Template)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: "Check your email for reset instructions." });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { email },
      data: { reset_token: token, reset_expires: expires }
    });

    await resend.emails.send({
      from: 'Janus Forge <nexus@janusforge.ai>',
      to: email,
      subject: 'Access Recovery: Janus Forge Nexus',
      html: `
        <div style="background-color: #000000; color: #ffffff; font-family: sans-serif; padding: 40px; text-align: center;">
          <div style="max-width: 600px; margin: 0 auto; border: 1px solid #1e40af; border-radius: 24px; padding: 40px; background: linear-gradient(180deg, #0a0a0a 0%, #000000 100%);">
            <h1 style="color: #3b82f6; font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 20px;">
              Janus Forge <span style="color: #ffffff;">Nexus</span>
            </h1>
            <p style="color: #9ca3af; font-size: 14px; font-style: italic; margin-bottom: 30px;">
              "A security token has been generated for your account recovery."
            </p>
            <div style="height: 1px; background: #1f2937; margin: 30px 0;"></div>
            <p style="font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
              The Council has verified your request for a password reset. This access link is valid for <strong>60 minutes</strong>.
            </p>
            <a href="https://janusforge.ai/reset-password?token=${token}" 
               style="background-color: #ffffff; color: #000000; padding: 16px 32px; border-radius: 12px; font-weight: 900; text-decoration: none; font-size: 12px; display: inline-block; letter-spacing: 1px;">
              RESET CREDENTIALS
            </a>
            <div style="height: 1px; background: #1f2937; margin: 30px 0;"></div>
            <p style="color: #4b5563; font-size: 10px; text-transform: uppercase; font-weight: bold;">
              If you did not request this, secure your account immediately.
            </p>
          </div>
        </div>
      `
    });

    res.json({ message: "Reset link sent." });
  } catch (err) { res.status(500).json({ error: "Failed to process request" }); }
});

// 4. Reset Password Verification
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    const user = await prisma.user.findFirst({
      where: {
        reset_token: token,
        reset_expires: { gt: new Date() }
      }
    });

    if (!user) return res.status(400).json({ error: "Invalid or expired token." });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: hashedPassword,
        reset_token: null,
        reset_expires: null
      }
    });

    res.json({ message: "Password updated successfully." });
  } catch (err) { res.status(500).json({ error: "Failed to reset password." }); }
});

// 5. Toggle Nightly Digest
app.post('/api/user/toggle-digest', async (req, res) => {
  const { userId, subscribe } = req.body;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { digest_subscribed: subscribe }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to update preference" }); }
});

app.get('/', (req, res) => { res.status(200).json({ status: "ONLINE" }); });
app.use('/api/daily-forge', dailyForgeRouter);

// --- 🏛️ SOCKET.IO (The Council) ---
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true },
  transports: ['polling', 'websocket']
});

io.on('connection', (socket) => {
  socket.on('post:new', async (postData) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: postData.userId } });
      if (!user || (user.role !== 'GOD_MODE' && user.tokens_remaining < 1)) return;

      io.emit('post:incoming', { id: crypto.randomUUID(), name: user.username, content: postData.content, sender: 'user' });

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
        await prisma.user.update({
          where: { id: user.id },
          data: { tokens_remaining: { decrement: 1 }, tokens_used: { increment: 1 } }
        });
      }
    } catch (err) { console.error(err); }
  });
});

const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, () => console.log(`🚀 Live on ${PORT}`));
