import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// 1. Consolidated Imports
import authRouter from './routes/auth'; 
import adminRouter from './routes/admin';
import nexusRouter from './services/nexus-core/nexus-router';
import dailyForgeRouter from './routes/daily-forge'; // Restores Daily Forge [cite: 2025-11-27]

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 10000;

// 2. AI Cluster (2026 Standards)
export const aiClients = {
  CLAUDE: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  GPT4: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  GEMINI: new GoogleGenerativeAI(process.env.GEMINI_API_KEY!),
  GROK: new OpenAI({ apiKey: process.env.GROK_API_KEY, baseURL: "https://api.x.ai/v1" }),
  DEEPSEEK: new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" })
};

// 3. Security & Middleware
const allowedOrigins = ['https://www.janusforge.ai', 'https://janusforge.ai', 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// 4. Service Gateways
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/nexus', nexusRouter);
app.use('/api/daily-forge', dailyForgeRouter); // Fixes Daily Forge 404s [cite: 2025-11-27]

// 🛡️ Safety Aliases for Legacy Frontend Components
app.use('/api/conversations', nexusRouter); 

// 5. Neural Link (Socket.io)
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true }
});
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join:room', (roomId) => socket.join(roomId));
});

httpServer.listen(PORT, () => console.log(`🚀 JANUS CORE: FULL SYSTEM RE-IGNITED`));

export { io };
