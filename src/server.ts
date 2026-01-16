import express, { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- 🛡️ FIREBREAK IMPORTS ---
import { setupNexusSockets, nexusSocketOptions } from './services/nexus-core/nexus-socket';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
// ✅ UPDATED: Importing the specific Nexus Prime boundary
import nexusPrimeRouter from './routes/nexusPrime'; 
import dailyForgeRouter from './routes/dailyForge';
import supportRoutes from './routes/supportRoutes'; 

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

// --- 3. FIREBREAK API GATEWAYS ---
// Grouped for organizational integrity
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

// ✅ BOUNDARY LOCK: Pointing to the new Prime Synthesis engine
app.use('/api/nexus', nexusPrimeRouter);           

app.use('/api/daily-forge', dailyForgeRouter);  // Public Debate Square
app.use('/api/support', supportRoutes);       

// 🛡️ LEGACY ALIAS: Maintains Sidebar history using the Prime router
app.use('/api/conversations', nexusPrimeRouter);

// --- 4. NEURAL LINK (SOCKETS) ---
const io = new Server(httpServer, {
  ...nexusSocketOptions,
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.set('io', io);

/**
 * 🌌 NEXUS PRIME: SECURE NAMESPACE
 */
setupNexusSockets(io);

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
  console.log(`🚀 JANUS FORGE NEXUS ® ACTIVE | PORT: ${PORT}`);
  console.log(`🛡️ AUTHORITY STATUS: admin@janusforge.ai - MASTER UNLOCKED`);
});

export { io };
