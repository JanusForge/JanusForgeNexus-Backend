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

// Production Allowed Origins
const allowedOrigins = [
  'https://janusforge.ai',
  'https://www.janusforge.ai',
  'http://localhost:3000'
];

app.use(cors({ origin: allowedOrigins, credentials: true }));

const io = new Server(httpServer, {
  cors: { 
    origin: allowedOrigins, 
    methods: ["GET", "POST"], 
    credentials: true 
  },
  transports: ['polling', 'websocket']
});

// Initialize AI SDKs with Render Environment Variables
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
    // 1. Relay human message immediately to the feed
    io.emit('post:incoming', {
      id: `user-${Date.now()}`,
      sender: 'user',
      name: postData.name || 'admin-access',
      content: postData.content,
      tier: postData.tier || 'basic',
      timestamp: new Date().toISOString()
    });

    // sharedContext allows models to "hear" each other
    let sharedContext = `The user asked: "${postData.content}"`;

    // --- STEP 1: GEMINI (The Initial Synthesis) ---
    try {
      // Using the more stable model string suffix
      const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
      const geminiResult = await geminiModel.generateContent(`You are Councilor GEMINI. ${sharedContext}. Provide a sharp, concise opening insight.`);
      const geminiText = geminiResult.response.text();
      
      sharedContext += `\nCouncilor GEMINI argued: "${geminiText}"`;

      io.emit('ai:response', {
        id: `ai-gemini-${Date.now()}`,
        sender: 'ai',
        name: 'Councilor GEMINI',
        avatar: '🌟',
        content: geminiText,
        tier: 'enterprise'
      });
    } catch (error) {
      console.error("❌ Gemini Pod Error:", error);
      sharedContext += `\n(Note: Councilor Gemini is observing silently.)`;
    }

    // --- STEP 2: CLAUDE (The Logical Counter) ---
    try {
      const claudeResponse = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 300,
        messages: [{ 
          role: "user", 
          content: `You are Councilor CLAUDE. ${sharedContext}. Debate the logic presented so far.` 
        }],
      });
      
      // Strict type check for Claude's response format
      const claudeText = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : 'Proceeding with analysis.';
      sharedContext += `\nCouncilor CLAUDE countered: "${claudeText}"`;

      io.emit('ai:response', {
        id: `ai-claude-${Date.now()}`,
        sender: 'ai',
        name: 'Councilor CLAUDE',
        avatar: '🧬',
        content: claudeText,
        tier: 'pro'
      });
    } catch (error) {
      console.error("❌ Claude Pod Error:", error);
    }

    // --- STEP 3: GROK (The Disruptor) ---
    try {
      const grokResponse = await xai.chat.completions.create({
        model: "grok-beta",
        messages: [
          { role: "system", content: "You are Councilor GROK. You are edgy, unfiltered, and provocative." },
          { role: "user", content: `The Council is debating. ${sharedContext}. Give the human the raw truth.` }
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
      console.error("❌ Grok Pod Error:", error);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Connection Terminated:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Janus Forge Nexus Backend Live on Port ${PORT}`);
});
