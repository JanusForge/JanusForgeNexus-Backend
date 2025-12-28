import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  'https://janusforge.ai',
  'https://www.janusforge.ai',
  'http://localhost:3000'
];

app.use(cors({ origin: allowedOrigins, credentials: true }));

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  transports: ['polling', 'websocket']
});

// Initialize AI SDKs with your environment variables
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const xai = new OpenAI({ 
  apiKey: process.env.XAI_API_KEY, 
  baseURL: "https://api.x.ai/v1" 
});

io.on('connection', (socket) => {
  console.log('🔌 Nexus Connection Established:', socket.id);

  socket.on('post:new', async (postData) => {
    // 1. Relay human message immediately
    io.emit('post:incoming', {
      id: `user-${Date.now()}`,
      sender: 'user',
      name: postData.name || 'admin-access',
      content: postData.content,
      tier: postData.tier || 'basic',
      timestamp: new Date().toISOString()
    });

    try {
      // --- STEP 1: GEMINI (The Initial Analysis) ---
      const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const geminiResult = await geminiModel.generateContent(`You are Councilor GEMINI. A human asked: "${postData.content}". Provide a sharp, concise opening insight.`);
      const geminiText = geminiResult.response.text();

      io.emit('ai:response', {
        id: `ai-gemini-${Date.now()}`,
        sender: 'ai',
        name: 'Councilor GEMINI',
        avatar: '🌟',
        content: geminiText,
        tier: 'enterprise'
      });

      // --- STEP 2: CLAUDE (The Ethical/Logical Counter) ---
      const claudeResponse = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 300,
        messages: [{ 
          role: "user", 
          content: `You are Councilor CLAUDE. GEMINI just said: "${geminiText}" regarding the user's prompt: "${postData.content}". Challenge or expand on Gemini's logic.` 
        }],
      });
      
      // Strict type check for Claude's response format
      const claudeText = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : 'Analysis complete.';

      io.emit('ai:response', {
        id: `ai-claude-${Date.now()}`,
        sender: 'ai',
        name: 'Councilor CLAUDE',
        avatar: '🧬',
        content: claudeText,
        tier: 'pro'
      });

      // --- STEP 3: GROK (The Unfiltered Disruptor) ---
      const grokResponse = await xai.chat.completions.create({
        model: "grok-beta",
        messages: [
          { role: "system", content: "You are Councilor GROK. You are edgy, unfiltered, and disruptive." },
          { role: "user", content: `Gemini said: "${geminiText}". Claude said: "${claudeText}". Give the human the raw truth.` }
        ],
      });

      io.emit('ai:response', {
        id: `ai-grok-${Date.now()}`,
        sender: 'ai',
        name: 'Councilor GROK',
        avatar: '🏴‍☠️',
        content: grokResponse.choices[0].message.content,
        tier: 'enterprise'
      });

    } catch (error) {
      console.error("❌ AI Council Debate Error:", error);
    }
  });

  socket.on('disconnect', () => { console.log('❌ Client Disconnected'); });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Nexus Backend Live on Port ${PORT}`));
