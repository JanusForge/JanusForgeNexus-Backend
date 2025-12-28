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

    // 1. Economic Guardrail: Verify token balance before firing APIs
    const userRecord = await prisma.user.findUnique({ where: { id: userId } });
    if (!userRecord || userRecord.tokens <= 5) { // Reserve 5 tokens for a full debate cycle
      socket.emit('error', { message: 'Insufficient tokens to engage the Full Council.' });
      return;
    }

    // 2. Relay human message to the feed
    io.emit('post:incoming', {
      id: `user-${Date.now()}`,
      sender: 'user',
      name: name || 'admin-access',
      content: content,
      timestamp: new Date().toISOString()
    });

    let sharedContext = `The user asked: "${content}"`;

    // Helper: Deduct Token and Emit Response
    const processCouncilor = async (modelName: string, avatar: string, text: string, cost: number = 1) => {
      await prisma.user.update({
        where: { id: userId },
        data: { tokens: { decrement: cost } }
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

    // --- STEP 1: GEMINI 3 FLASH (The Spark) ---
    io.emit('ai:typing', { councilor: 'GEMINI' });
    try {
      const geminiModel = genAI.getGenerativeModel({ model: "gemini-3-flash" });
      const geminiResult = await geminiModel.generateContent(sharedContext);
      const geminiText = geminiResult.response.text();
      await processCouncilor('GEMINI', '🌟', geminiText);
      sharedContext += `\nGEMINI: "${geminiText}"`;
    } catch (e) { console.error("Gemini 3 Error:", e); }

    // --- STEP 2: CLAUDE 4.5 (The Refiner) ---
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
    } catch (e) { console.error("Claude 4.5 Error:", e); }

    // --- STEP 3: DEEPSEEK REASONER (Logic Gate) ---
    io.emit('ai:typing', { councilor: 'DEEPSEEK' });
    try {
      const dsResponse = await deepseek.chat.completions.create({
        model: "deepseek-reasoner",
        messages: [{ role: "user", content: `You are Councilor DEEPSEEK. ${sharedContext}. Reason through the synthesis.` }],
      });
      const dsText = dsResponse.choices[0].message.content || 'Synthesizing...';
      await processCouncilor('DEEPSEEK', '🧠', dsText);
      sharedContext += `\nDEEPSEEK: "${dsText}"`;
    } catch (e) { console.error("DeepSeek Error:", e); }

    // --- STEP 4: GROK 3 (The Disruptor) ---
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
    } catch (e) { console.error("Grok 3 Error:", e); }

    // --- STEP 5: THE JANUS VERDICT (Synthesis) ---
    io.emit('ai:typing', { councilor: 'JANUS' });
    try {
      const gptResponse = await openai.chat.completions.create({
        model: "gpt-5.2-pro",
        messages: [{ role: "user", content: `Provide the final 'Janus Verdict' for this entire session: ${sharedContext}` }],
      });
      const verdictText = gptResponse.choices[0].message.content || 'Finalizing...';
      
      // The Verdict is a premium synthesis and costs 2 tokens
      await processCouncilor('JANUS VERDICT', '🤖', verdictText, 2);
    } catch (e) { console.error("Janus Verdict Error:", e); }

    // Clear Typing State
    io.emit('ai:typing', { councilor: null });
  });

  socket.on('disconnect', () => { console.log('❌ Connection Terminated'); });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Economic Nexus Backend Live on Port ${PORT}`));
