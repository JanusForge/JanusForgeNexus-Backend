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

const allowedOrigins = ['https://janusforge.ai', 'https://www.janusforge.ai', 'http://localhost:3000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  transports: ['polling', 'websocket']
});

// 2025 ELITE SDK Initializations
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // GPT-5.2
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); // Claude 4.5
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || ""); // Gemini 3 Flash
const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" }); // Grok-3
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" }); // DeepSeek V3.2

io.on('connection', (socket) => {
  console.log('🔌 Nexus Connection Established:', socket.id);

  socket.on('post:new', async (postData) => {
    io.emit('post:incoming', {
      id: `user-${Date.now()}`,
      sender: 'user',
      name: postData.name || 'admin-access',
      content: postData.content,
      timestamp: new Date().toISOString()
    });

    let sharedContext = `The user asked: "${postData.content}"`;

    // --- STEP 1: GEMINI 3 FLASH (The Spark) ---
    try {
      const geminiModel = genAI.getGenerativeModel({ model: "gemini-3-flash" });
      const geminiResult = await geminiModel.generateContent(`You are Councilor GEMINI. ${sharedContext}. Provide a sharp opening insight.`);
      const geminiText = geminiResult.response.text();
      sharedContext += `\nGEMINI: "${geminiText}"`;

      io.emit('ai:response', {
        id: `ai-gemini-${Date.now()}`,
        sender: 'ai',
        name: 'Councilor GEMINI',
        avatar: '🌟',
        content: geminiText,
        tier: 'enterprise'
      });
    } catch (e) { console.error("Gemini 3 Error:", e); }

    // --- STEP 2: CLAUDE 4.5 SONNET (The Refiner) ---
    try {
      const claudeResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 300,
        messages: [{ role: "user", content: `You are Councilor CLAUDE. ${sharedContext}. Critique or expand on the opening logic.` }],
      });
      const claudeText = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : 'Analyzing...';
      sharedContext += `\nCLAUDE: "${claudeText}"`;

      io.emit('ai:response', {
        id: `ai-claude-${Date.now()}`,
        sender: 'ai',
        name: 'Councilor CLAUDE',
        avatar: '🧬',
        content: claudeText,
        tier: 'pro'
      });
    } catch (e) { console.error("Claude 4.5 Error:", e); }

    // --- STEP 3: GPT-5.2 PRO (The Authority) ---
    try {
      const gptResponse = await openai.chat.completions.create({
        model: "gpt-5.2-pro",
        messages: [{ role: "user", content: `You are Councilor JANUS (GPT-5.2). ${sharedContext}. Synthesize the argument so far.` }],
      });
      const gptText = gptResponse.choices[0].message.content || 'Synthesizing...';
      sharedContext += `\nJANUS: "${gptText}"`;

      io.emit('ai:response', {
        id: `ai-janus-${Date.now()}`,
        sender: 'ai',
        name: 'Councilor JANUS-5',
        avatar: '🤖',
        content: gptText,
        tier: 'enterprise'
      });
    } catch (e) { console.error("GPT-5.2 Error:", e); }

    // --- STEP 4: DEEPSEEK REASONER (The Logic Gate) ---
    try {
      const dsResponse = await deepseek.chat.completions.create({
        model: "deepseek-reasoner",
        messages: [{ role: "user", content: `You are Councilor DEEPSEEK. ${sharedContext}. Find the logical flaws in this consensus.` }],
      });
      const dsText = dsResponse.choices[0].message.content || 'Reasoning...';
      sharedContext += `\nDEEPSEEK: "${dsText}"`;

      io.emit('ai:response', {
        id: `ai-deepseek-${Date.now()}`,
        sender: 'ai',
        name: 'Councilor DEEPSEEK',
        avatar: '🧠',
        content: dsText,
        tier: 'pro'
      });
    } catch (e) { console.error("DeepSeek Error:", e); }

    // --- STEP 5: GROK 3 (The Disruptor) ---
    try {
      const grokResponse = await xai.chat.completions.create({
        model: "grok-3",
        messages: [
          { role: "system", content: "You are Councilor GROK. Edgy and disruptive." },
          { role: "user", content: `The Council has finished. ${sharedContext}. Roast the consensus and end the session.` }
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
    } catch (e) { console.error("Grok 3 Error:", e); }
  });

  socket.on('disconnect', () => { console.log('❌ Connection Terminated'); });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 2025 ELITE Council Live on Port ${PORT}`));
