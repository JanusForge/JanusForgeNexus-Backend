import express, { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- 🛡️ SOVEREIGN IMPORTS ---
import { setupNexusSockets } from './services/nexus-core/nexus-socket';
import { prisma } from './lib/prisma'; // 🟢 NEON PERSISTENCE
import authRouter from './routes/auth';
import nexusPrimeRouter from './routes/nexusPrime';
import stripeRouter from './routes/stripe';
import webhookRouter from './routes/webhooks';
import nodesRouter from './routes/nodes';
import leaderboardRouter from './routes/admin/leaderboard';
import nexusPublicRouter from './routes/nexusPublic';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 10000;

// --- 1. AI CLUSTER ---
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

// --- 2. SECURITY ---
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

// --- 3. MIDDLEWARE ---
app.use(express.json({ limit: '10mb' }));

// --- 4. NEURAL PERSISTENCE (EXCISED MONGODB, ARMED PRISMA) ---
async function synchronizeCore() {
  try {
    await prisma.$connect();
    console.log("🟢 JANUS CORE: Neon Link Synchronized.");
  } catch (err) {
    console.error("❌ JANUS CORE ERROR (Desynchronized):", err);
  }
}
synchronizeCore();

// --- 5. ACTIVE GATEWAYS ---
app.use('/api/auth', authRouter);
app.use('/api/nexus', nexusPrimeRouter);
app.use('/api/conversations', nexusPrimeRouter);
app.use('/api/stripe', stripeRouter);
app.use('/api/webhooks', webhookRouter);
app.use('/api/nodes', nodesRouter);
app.use('/api/admin', leaderboardRouter);
app.use('/api/nexus/public', nexusPublicRouter);

// --- 6. NEURAL LINK (SOCKETS) ---
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
});

app.set('socketio', io);
setupNexusSockets(io);

// --- 7. RESILIENCE ---
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("🚀 SYSTEM FAULT:", err.stack);
  res.status(500).json({ error: "Nexus desynchronized." });
});

// --- 8. AUTHORITY ---
httpServer.listen(PORT, () => {
  console.log(`🚀 JANUS FORGE NEXUS ACTIVE | PORT: ${PORT}`);
});

export { io };
