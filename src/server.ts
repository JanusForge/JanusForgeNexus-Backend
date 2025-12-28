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

// 2025 ELITE SDK Initializations
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });

io.on('connection', (socket) => {
  console.log('🔌 Nexus Connection Established:', socket.id);

  socket.on('post:new', async (postData) => {
    const { userId, content, name } = postData;

    try {
      // 1. Economic Guardrail: Check token_balance
      const userRecord = await prisma.user.findUnique({ where: { id: userId } });
      
      // Fixed property name to match your database schema
      if (!userRecord || userRecord.token_balance <= 5) {
        socket.emit('error', { message: 'Insufficient tokens to engage the Council.' });
        return;
      }

      // 2. Relay human message
      io.emit('post:incoming', {
        id: `user-${Date.now()}`,
        sender: 'user',
        name: name || 'admin-access',
        content: content,
        timestamp: new Date().toISOString()
      });

      let sharedContext = `The user asked: "${content}"`;

      // Helper: Deduct from token_balance and Emit
      const processCouncilor = async (modelName: string, avatar: string, text: string, cost: number = 1) => {
        await prisma.user.update({
          where: { id: userId },
          data: { token_balance: { decrement: cost } } // Fixed property name here too
        });
        
        io.emit('ai:response', {
          id: `ai-${modelName}-${Date.now()}`,
          sender: 'ai',
          name: `Councilor ${modelName}`,
          avatar: avatar,
          content: text,
          tier: 'enterprise'
        });
      };

      // --- STEP 1: GEMINI 3 FLASH ---
      io.emit('ai:typing', { councilor: 'GEMINI' });
      try {
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-3-flash" });
        const geminiResult = await geminiModel.generateContent(sharedContext);
        const geminiText = geminiResult.response.text();
        await processCouncilor('GEMINI', '🌟', geminiText);
        sharedContext += `\nGEMINI: "${geminiText}"`;
      } catch (e) { console.error("Gemini Error:", e); }

      // --- STEP 2: CLAUDE 4.5 ---
      io.emit('ai:typing', { councilor: 'CLAUDE' });
      try {
        const claudeResponse = await anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 300,
          messages: [{ role: "user", content: `You are Councilor CLAUDE. ${sharedContext}. Debate the logic.` }],
        });
        const claudeText = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : 'Analyzing...';
        await processCouncilor('CLAUDE', '🧬', claudeText);
        sharedContext += `\nCLAUDE: "${claudeText}"`;
      } catch (e) { console.error("Claude Error:", e); }

      // --- STEP 3: DEEPSEEK REASONER ---
      io.emit('ai:typing', { councilor: 'DEEPSEEK' });
      try {
        const dsResponse = await deepseek.chat.completions.create({
          model: "deepseek-reasoner",
          messages: [{ role: "user", content: `You are Councilor DEEPSEEK. ${sharedContext}. Find the logical flaws.` }],
        });
        const dsText = dsResponse.choices[0].message.content || 'Reasoning...';
        await processCouncilor('DEEPSEEK', '🧠', dsText);
        sharedContext += `\nDEEPSEEK: "${dsText}"`;
      } catch (e) { console.error("DeepSeek Error:", e); }

      // --- STEP 4: GROK 3 ---
      io.emit('ai:typing', { councilor: 'GROK' });
      try {
        const grokResponse = await xai.chat.completions.create({
          model: "grok-3",
          messages: [
            { role: "system", content: "You are Councilor GROK. Edgy and disruptive." },
            { role: "user", content: `Debate status: ${sharedContext}. Roast the consensus.` }
          ],
        });
        const grokText = grokResponse.choices[0].message.content || 'Disrupting...';
        await processCouncilor('GROK', '🏴‍☠️', grokText);
        sharedContext += `\nGROK: "${grokText}"`;
      } catch (e) { console.error("Grok Error:", e); }

      // --- STEP 5: THE JANUS VERDICT ---
      io.emit('ai:typing', { councilor: 'JANUS' });
      try {
        const gptResponse = await openai.chat.completions.create({
          model: "gpt-5.2-pro",
          messages: [{ role: "user", content: `Synthesize this entire debate into one final 'Janus Verdict': ${sharedContext}` }],
        });
        const verdictText = gptResponse.choices[0].message.content || 'Finalizing...';
        await processCouncilor('JANUS VERDICT', '🤖', verdictText, 2);
      } catch (e) { console.error("Janus Verdict Error:", e); }

      io.emit('ai:typing', { councilor: null });

    } catch (globalError) {
      console.error("Critical Nexus Error:", globalError);
    }
  });

  socket.on('disconnect', () => { console.log('❌ Connection Terminated'); });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Janus Forge Nexus Backend Live on Port ${PORT}`));
