import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// Consolidated Route Imports
import authRouter from './routes/auth'; 
import adminRouter from './routes/admin';
import nexusRouter from './services/nexus-core/nexus-router';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 10000;

// --- ⚙️ AI CLUSTER INITIALIZATION (2026 STANDARDS) ---
export const aiClients = {
  CLAUDE: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  GPT4: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  GEMINI: new GoogleGenerativeAI(process.env.GEMINI_API_KEY!),
  GROK: new OpenAI({ apiKey: process.env.GROK_API_KEY, baseURL: "https://api.x.ai/v1" }),
  DEEPSEEK: new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" })
};

// --- 🛡️ SECURITY & MIDDLEWARE ---
const allowedOrigins = ['https://www.janusforge.ai', 'https://janusforge.ai', 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// API Gateways
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/nexus', nexusRouter);

// --- 📡 NEURAL LINK (SOCKET.IO) ---
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true }
});

app.set('io', io); // Shared instance for services

io.on('connection', (socket) => {
  socket.on('join:room', (roomId) => socket.join(roomId));
});

httpServer.listen(PORT, () => console.log(`🚀 JANUS FORGE: NEXUS CORE ACTIVE [PORT ${PORT}]`));

export { io };
