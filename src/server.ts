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
// We only import active, high-authority logic. Legacy ghosts are exiled.
import { setupNexusSockets, nexusSocketOptions } from './services/nexus-core/nexus-socket';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import nexusPrimeRouter from './routes/nexusPrime';

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

app.use(express.json({ limit: '10mb' }));

// --- 3. NEURAL PERSISTENCE (MONGODB HANDSHAKE) ---
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ CRITICAL: MONGODB_URI is not defined. Neural Memory Offline.");
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("🟢 NEURAL LINK: MongoDB Atlas Connected"))
    .catch((err) => console.error("❌ NEURAL LINK ERROR:", err));
}

// --- 4. FIREBREAK API GATEWAYS ---
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

// ✅ BOUNDARY LOCK: The Prime Synthesis Engine
// All adversarial logic and conversation history flows through here.
app.use('/api/nexus', nexusPrimeRouter);

// 🛡️ LEGACY ALIAS: Maintains Sidebar history link to the Prime router
app.use('/api/conversations', nexusPrimeRouter);

// --- 5. NEURAL LINK (SOCKETS) ---
const io = new Server(httpServer, {
  ...nexusSocketOptions,
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.set('io', io);
setupNexusSockets(io);

io.on('connection', (socket) => {
  socket.on('join:room', (roomId) => {
    socket.join(roomId);
    console.log(`🔌 Public Neural Link: Room ${roomId}`);
  });
});

// --- 6. RESILIENCE LAYER ---
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("🚀 CRITICAL SYSTEM FAULT:", err.stack);
  res.status(500).json({ error: "Neural link desynchronized. System rebooting." });
});

// --- 7. AUTHORITY INITIALIZATION ---
httpServer.listen(PORT, () => {
  console.log(`🚀 JANUS FORGE NEXUS® ACTIVE | PORT: ${PORT}`);
  console.log(`🛡️ AUTHORITY STATUS: admin@janusforge.ai - MASTER UNLOCKED`);
});

export { io };
