import express, { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 🛡️ Firebreak Imports
import { setupNexusSockets, nexusSocketOptions } from './services/nexus-core/nexus-socket';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import nexusRouter from './services/nexus-core/nexus-router';
import dailyForgeRouter from './routes/dailyForge';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 10000;

// --- 1. AI CLUSTER (2026 FRONTIER STANDARDS) ---
export const aiClients = {
  CLAUDE: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  GPT4: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  GEMINI: new GoogleGenerativeAI(process.env.GEMINI_API_KEY!),
  // Grok & DeepSeek leverage OpenAI-compatible SDKs via specialized baseURLs
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
  'https://janusforgenexus-react.vercel.app' // Added Vercel for the CouncilBuilder build
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Increased limit for complex 5-AI synthesis logs and large prompts
app.use(express.json({ limit: '10mb' })); 

// --- 3. FIREBREAK API GATEWAYS ---
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/nexus', nexusRouter);           // Private Frontier Cluster
app.use('/api/daily-forge', dailyForgeRouter);  // Public Debate Square

// 🛡️ LEGACY ALIAS: Preserves backward compatibility for the Sidebar logic
app.use('/api/conversations', nexusRouter);

// --- 4. NEURAL LINK (SOCKETS) ---
const io = new Server(httpServer, {
  ...nexusSocketOptions,
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Pass 'io' to the app context so routers/engines can broadcast
app.set('io', io);

/**
 * 🌌 NEXUS PRIME: SECURE NAMESPACE
 * Initializes specialized logic (Heartbeats/Isolation) specifically 
 * for the /nexus-prime firebreak namespace.
 */
setupNexusSockets(io);

// Standard socket fallback (Public Daily Forge)
io.on('connection', (socket) => {
  socket.on('join:room', (roomId) => {
    socket.join(roomId);
    console.log(`🔌 Public Neural Link: Room ${roomId}`);
  });
});

// --- 5. RESILIENCE LAYER ---
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("🚀 CRITICAL SYSTEM FAULT:", err.stack);
  res.status(500).json({ error: "Neural link desynchronized. System rebooting." });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 JANUS CORE ACTIVE | PORT: ${PORT}`);
  console.log(`🛡️ AUTHORITY STATUS: admin@janusforge.ai - MASTER UNLOCKED`);
});

export { io };
