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

import authRouter from './routes/auth'; 
import adminRouter from './routes/admin';
import nexusRouter from './services/nexus-core/nexus-router';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 10000;

// --- 2. AI CLUSTER INITIALIZATION (JAN 2026) ---
// Centralized for the 5-node Frontier Cluster
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

// --- 4. SERVICE GATEWAYS ---
app.use('/api/auth', authRouter);   // Fixes 404/401 Login
app.use('/api/admin', adminRouter); // Fixes 404/401 Dashboard
app.use('/api/nexus', nexusRouter); // New Private Engine

// 🛡️ SAFETY ALIAS: Maps old frontend requests to the new engine
app.use('/api/conversations', nexusRouter); 

// --- 5. THE NEURAL LINK (SOCKET.IO) ---
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Attach io to app so routers can trigger streams
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`📡 Neural Link Established: ${socket.id}`);
  
  socket.on('join:room', (roomId) => {
    socket.join(roomId);
    console.log(`🔐 Admin Authority joined Room: ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Neural Link Severed: ${socket.id}`);
  });
});

// --- 6. INITIALIZATION ---
httpServer.listen(PORT, () => {
  console.log(`
  --------------------------------------------------
  🚀 JANUS FORGE: CONSOLIDATED ENGINE ONLINE
  🛠️  Mode: 2026 Frontier Cluster Active
  🛡️  Identity: Master Authority (admin@janusforge.ai)
  --------------------------------------------------
  `);
});

export { io };
