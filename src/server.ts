import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- 1. CONFIGURATION & ROUTE IMPORTS ---
dotenv.config();

// CORRECTED PATH: Points to src/routes/auth/index.ts
import authRouter from './routes/auth'; 
import nexusRouter from './services/nexus-core/nexus-router';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 10000;

// --- 2. AI CLIENT INITIALIZATION (JAN 2026) ---
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const xai = new OpenAI({ 
  apiKey: process.env.GROK_API_KEY, 
  baseURL: "https://api.x.ai/v1" 
});
const deepseek = new OpenAI({ 
  apiKey: process.env.DEEPSEEK_API_KEY, 
  baseURL: "https://api.deepseek.com" 
});

export const aiClients = {
  CLAUDE: anthropic,
  GPT4: openai,
  GEMINI: genAI,
  GROK: xai,
  DEEPSEEK: deepseek
};

// --- 3. MIDDLEWARE & CROSS-ORIGIN SECURITY ---
const allowedOrigins = [
  'https://www.janusforge.ai',
  'https://janusforge.ai',
  'http://localhost:3000'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Gateways
app.use('/api/auth', authRouter);
app.use('/api/nexus', nexusRouter);

// --- 4. THE NEURAL LINK (SOCKET.IO) ---
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`📡 Neural Link Established: ${socket.id}`);
  socket.on('join:room', (roomId) => {
    socket.join(roomId);
    console.log(`🔐 Admin Joined Private Room: ${roomId}`);
  });
  socket.on('disconnect', () => {
    console.log(`🔌 Neural Link Severed: ${socket.id}`);
  });
});

// --- 5. INITIALIZATION ---
httpServer.listen(PORT, () => {
  console.log(`🚀 JANUS FORGE NEXUS CORE LIVE ON PORT ${PORT}`);
});

export { io };
