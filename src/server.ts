import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

const allowedOrigins = ['https://janusforge.ai', 'https://www.janusforge.ai', 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  transports: ['polling', 'websocket']
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

io.on('connection', (socket) => {
  console.log('🔌 Nexus Connection Established:', socket.id);


socket.on('post:new', async (postData) => {
  const { userId, content, name } = postData;
  
  // 1. Identify the Creator
  const isAdmin = name === 'admin-access';

  try {
    const userRecord = await prisma.user.findUnique({ where: { id: userId } });
    
    // 2. ADMIN BYPASS: If not admin, enforce the token floor
    if (!isAdmin && (!userRecord || userRecord.token_balance <= 5)) {
      socket.emit('error', { message: 'Insufficient tokens.' });
      return;
    }

    // Broadcast the user message to the Nexus
    io.emit('post:incoming', {
      id: `user-${Date.now()}`,
      sender: 'user',
      name: name,
      content: content,
      timestamp: new Date().toISOString()
    });

    // 3. Sequential AI Waterfall Logic
    const processCouncilor = async (modelName: string, avatar: string, text: string, cost: number = 1) => {
      // 4. GOD MODE DEDUCTION BYPASS
      if (!isAdmin) {
        await prisma.user.update({
          where: { id: userId },
          data: { token_balance: { decrement: cost } }
        });
      }
      
      io.emit('ai:response', {
        id: `ai-${modelName}-${Date.now()}`,
        sender: 'ai',
        name: `Councilor ${modelName}`,
        avatar: avatar,
        content: text,
        isVerdict: modelName === 'JANUS VERDICT'
      });
    };  


      // --- COUNCIL SEQUENCE ---
      io.emit('ai:typing', { councilor: 'GEMINI' });
      try {
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-3-flash" });
        const result = await geminiModel.generateContent(sharedContext);
        const text = result.response.text();
        await processCouncilor('GEMINI', '🌟', text);
        sharedContext += `\nGEMINI: "${text}"`;
      } catch (e) { console.error(e); }

      io.emit('ai:typing', { councilor: 'CLAUDE' });
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 300,
          messages: [{ role: "user", content: `You are Councilor CLAUDE. ${sharedContext}. Debate.` }],
        });
        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        await processCouncilor('CLAUDE', '🧬', text);
        sharedContext += `\nCLAUDE: "${text}"`;
      } catch (e) { console.error(e); }

      io.emit('ai:typing', { councilor: 'DEEPSEEK' });
      try {
        const dsResponse = await deepseek.chat.completions.create({
          model: "deepseek-reasoner",
          messages: [{ role: "user", content: `You are Councilor DEEPSEEK. ${sharedContext}. Analyze flaws.` }],
        });
        const text = dsResponse.choices[0].message.content || '';
        await processCouncilor('DEEPSEEK', '🧠', text);
        sharedContext += `\nDEEPSEEK: "${text}"`;
      } catch (e) { console.error(e); }

      io.emit('ai:typing', { councilor: 'GROK' });
      try {
        const grokResponse = await xai.chat.completions.create({
          model: "grok-3",
          messages: [{ role: "system", content: "You are Councilor GROK. Disruptive." }, { role: "user", content: sharedContext }],
        });
        const text = grokResponse.choices[0].message.content || '';
        await processCouncilor('GROK', '🏴‍☠️', text);
        sharedContext += `\nGROK: "${text}"`;
      } catch (e) { console.error(e); }

      io.emit('ai:typing', { councilor: 'JANUS' });
      try {
        const gptResponse = await openai.chat.completions.create({
          model: "gpt-5.2-pro",
          messages: [{ role: "user", content: `Provide the final Janus Verdict: ${sharedContext}` }],
        });
        const text = gptResponse.choices[0].message.content || '';
        await processCouncilor('JANUS VERDICT', '🤖', text, 2);
      } catch (e) { console.error(e); }

      io.emit('ai:typing', { councilor: null });
    } catch (globalError) { console.error(globalError); }
  });

  socket.on('disconnect', () => { console.log('❌ Connection Terminated'); });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Nexus Backend Live on Port ${PORT}`));
