// src/server.ts (Backend)
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
// ... other imports ...

dotenv.config();
const app = express();
const httpServer = createServer(app);

// Standardized Origins
const allowedOrigins = ['https://janusforge.ai', 'https://www.janusforge.ai', 'http://localhost:3000'];

app.use(cors({ origin: allowedOrigins, credentials: true }));

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true },
  transports: ['polling', 'websocket']
});

io.on('connection', (socket) => {
  console.log('🔌 Connected:', socket.id);

  socket.on('post:new', async (postData) => {
    // 1. Relay human message immediately
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      name: postData.name || 'Anonymous',
      content: postData.content,
      timestamp: new Date().toISOString(),
      tier: postData.tier || 'free'
    };
    io.emit('post:incoming', userMsg);

    // 2. Simulate AI Response with a clear event name
    setTimeout(() => {
      const aiMsg = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        avatar: '🤖',
        name: 'Councilor JANUS-7',
        role: 'Nexus Overseer',
        content: `Council synchronized. Analyzing: "${postData.content.substring(0, 20)}...". The Forge is hot.`,
        timestamp: new Date().toISOString(),
        tier: 'enterprise'
      };
      // CRITICAL: Matches the frontend listener exactly
      io.emit('ai:response', aiMsg);
    }, 1500);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Backend live on port ${PORT}`));
