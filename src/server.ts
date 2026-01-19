import express, { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- 🛡️ SOVEREIGN IMPORTS ---
import { setupNexusSockets, nexusSocketOptions } from './services/nexus-core/nexus-socket';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import nexusPrimeRouter from './routes/nexusPrime';
import stripeRouter from './routes/stripe';
import webhookRouter from './routes/webhooks';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 10000;

// --- 1. AI CLUSTER (2026 FRONTIER STANDARDS) ---
export const aiClients = {
  CLAUDE: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  GPT4: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  GEMINI: new GoogleGenerativeAI(process.env.GEMINI_API_KEY!),
  GROK: new OpenAI({
    apiKey: process.env.GROK_API_KEY,
    baseURL: "https://api.x.ai/v1"
  }),
  DEEPSEEK: new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com"
  })
};
app.set('aiClients', aiClients);

// --- 2. SECURITY & RESOURCE OPTIMIZATION ---
const allowedOrigins = [
  'https://www.janusforge.ai',
  'https://janusforge.ai',
  'http://localhost:3000',
  'https://janusforgenexus-react.vercel.app'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// --- ⚡ CRITICAL: WEBHOOK PRIORITY ZONE ⚡ ---
// This MUST come before app.use(express.json())
// We capture the raw buffer specifically for Stripe's signature verification.
app.use('/api/webhooks', express.raw({ 
  type: 'application/json',
  verify: (req: any, res, buf) => {
    req.rawBody = buf; 
  }
}), webhookRouter);

// --- 3. STANDARD MIDDLEWARE (Runs for everything else) ---
app.use(express.json({ limit: '10mb' }));

// --- 4. NEURAL PERSISTENCE (MONGODB) ---
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("🟢 NEURAL LINK: MongoDB Atlas Connected"))
    .catch((err) => console.error("❌ NEURAL LINK ERROR:", err));
}

// --- 5. FIREBREAK API GATEWAYS ---
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/nexus', nexusPrimeRouter);
app.use('/api/conversations', nexusPrimeRouter);
app.use('/api/stripe', stripeRouter);

// --- 6. NEURAL LINK (SOCKETS) ---
const io = new Server(httpServer, {
  ...nexusSocketOptions,
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.set('socketio', io);
setupNexusSockets(io);

let liveWatchers = 0;
io.on('connection', (socket) => {
  liveWatchers++;
  io.emit('pulse-update', { count: liveWatchers });

  socket.on('disconnect', () => {
    liveWatchers = Math.max(0, liveWatchers - 1);
    io.emit('pulse-update', { count: liveWatchers });
  });
});

// --- 7. RESILIENCE LAYER ---
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("🚀 CRITICAL SYSTEM FAULT:", err.stack);
  res.status(500).json({ error: "Neural link desynchronized." });
});

// --- 8. AUTHORITY INITIALIZATION ---
httpServer.listen(PORT, () => {
  console.log(`🚀 JANUS FORGE NEXUS® ACTIVE | PORT: ${PORT}`);
});

export { io };
