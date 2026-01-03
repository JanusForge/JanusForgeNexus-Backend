import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';

const router = Router();
const prisma = new PrismaClient();

// Clients (must be defined here)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ 
  apiKey: process.env.DEEPSEEK_API_KEY, 
  baseURL: "https://api.deepseek.com" 
});
const xai = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

// --- 🛰️ HELPER: DEFENSIVE PARSER ---
const safeParse = (data: any, fallback: any) => {
  try {
    return typeof data === 'string' ? JSON.parse(data) : (data || fallback);
  } catch (e) {
    return fallback;
  }
};

// --- 🏠 GET CURRENT FORGE ---
router.get('/', async (req: Request, res: Response) => {
  try {
    const forge = await prisma.dailyForge.findFirst({
      orderBy: { date: 'desc' },
    });
    if (!forge) return res.status(404).json({ error: 'No active Forge found' });
    res.json({
      ...forge,
      scoutedTopics: safeParse(forge.scoutedTopics, []),
      councilVotes: safeParse(forge.councilVotes, {}),
      openingThoughts: forge.openingThoughts || "Synthesis in progress..."
    });
  } catch (error) {
    console.error("❌ API Error:", error);
    res.status(500).json({ error: 'Failed to fetch forge data' });
  }
});

// --- 🏛️ ARCHIVE FETCH ---
router.get('/history', async (req: Request, res: Response) => {
  try {
    const history = await prisma.dailyForge.findMany({
      where: { phase: 'COUNCIL_DEBATE' },
      orderBy: { date: 'desc' },
      skip: 1
    });
    const parsedHistory = history.map(h => ({
      ...h,
      scoutedTopics: safeParse(h.scoutedTopics, []),
      councilVotes: safeParse(h.councilVotes, {})
    }));
    res.json(parsedHistory);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve archives." });
  }
});

// --- 🎙️ INTERJECTION: LIVE 3-AI COUNCIL DEBATE ---
// Add to server.ts
app.get('/api/ai-health', async (req, res) => {
  const health = {
    timestamp: new Date().toISOString(),
    services: {}
  };
  
  // Test each service with a simple prompt
  const testPrompt = "Respond with 'OK' if you can hear me.";
  
  try {
    // Test Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const geminiRes = await model.generateContent(testPrompt);
    health.services.GEMINI = geminiRes.response.text()?.includes('OK') ? '✅' : '❌';
  } catch (e) { health.services.GEMINI = '❌'; }
  
  try {
    // Test DeepSeek
    const deepseekRes = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: testPrompt }]
    });
    health.services.DEEPSEEK = deepseekRes.choices[0].message.content?.includes('OK') ? '✅' : '❌';
  } catch (e) { health.services.DEEPSEEK = '❌'; }
  
  try {
    // Test Grok
    const grokRes = await xai.chat.completions.create({
      model: "grok-beta",
      messages: [{ role: "user", content: testPrompt }]
    });
    health.services.GROK = grokRes.choices[0].message.content?.includes('OK') ? '✅' : '❌';
  } catch (e) { health.services.GROK = '❌'; }
  
  res.json(health);
});


export default router;
