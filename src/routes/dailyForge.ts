import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Anthropic } from '@anthropic-ai/sdk';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- 🛰️ HELPER: DEFENSIVE PARSER ---
// Preserves your logic for handling flat strings vs objects
const safeParse = (data: any, fallback: any) => {
  try {
    return typeof data === 'string' ? JSON.parse(data) : (data || fallback);
  } catch (e) {
    return fallback;
  }
};

// --- 🏠 GET CURRENT FORGE (PERSERVED & ENHANCED) ---
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

// --- 🏛️ ARCHIVE FETCH: GET /api/daily-forge/history ---
router.get('/history', async (req: Request, res: Response) => {
  try {
    const history = await prisma.dailyForge.findMany({
      where: { phase: 'COUNCIL_DEBATE' },
      orderBy: { date: 'desc' },
      skip: 1 // Skip the current active topic
    });
    
    // Apply safe parsing to history items too
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

// --- 🎙️ INTERJECTION: POST /api/daily-forge/interject ---
router.post('/interject', async (req: Request, res: Response) => {
  const { userId, content } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== 'GOD_MODE' && user.tokens_remaining < 1)) {
      return res.status(403).json({ error: "Insufficient Authority or Tokens." });
    }

    // Deduct token if not GOD_MODE
    if (user.role !== 'GOD_MODE') {
      await prisma.user.update({
        where: { id: userId },
        data: { tokens_remaining: { decrement: 1 } }
      });
    }

    // Get current forge
    const currentForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
    if (!currentForge) {
      return res.status(404).json({ error: "No active Daily Forge" });
    }

    // Build initial context from scout
    let context = `Topic: ${currentForge.winningTopic}\n\nScout opening: ${currentForge.openingThoughts || "No scout thoughts"}\n\nUser interjection: ${content}`;

    const councilResponses = [];
    const councilQueue = ["GEMINI", "DEEPSEEK", "GROK"];

    for (const modelName of councilQueue) {
      let aiContent = "";
      try {
        if (modelName === "GEMINI") {
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
          const res = await model.generateContent(context + "\n\nRespond as GEMINI in the Daily Forge debate.");
          aiContent = res.response.text();
        } else if (modelName === "DEEPSEEK") {
          const res = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: context + "\n\nRespond as DEEPSEEK." }]
          });
          aiContent = res.choices[0].message.content || "No response";
        } else if (modelName === "GROK") {
          const res = await xai.chat.completions.create({
            model: "grok-4.1-fast",
            messages: [{ role: "user", content: context + "\n\nRespond as GROK." }]
          });
          aiContent = res.choices[0].message.content || "No response";
        }
      } catch (modelErr) {
        console.error(`Daily Forge ${modelName} error:`, modelErr);
        aiContent = `[${modelName} temporarily unavailable]`;
      }

      councilResponses.push({ model: modelName, content: aiContent });
      context += `\n\n${modelName}: ${aiContent}`;
    }

    res.json({
      success: true,
      userName: user.username,
      councilResponses,
      newBalance: user.role === 'GOD_MODE' ? user.tokens_remaining : user.tokens_remaining - 1
    });
  } catch (error) {
    console.error('Daily Forge Interjection Error:', error);
    res.status(500).json({ error: "Council transmission failed." });
  }
});


export default router;
