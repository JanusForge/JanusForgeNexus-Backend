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

    // 1. Deduct Token if not GOD_MODE
    if (user.role !== 'GOD_MODE') {
      await prisma.user.update({
        where: { id: userId },
        data: { tokens_remaining: { decrement: 1 }, tokens_used: { increment: 1 } }
      });
    }

    // 2. Generate Council Reaction using Opus 4.5
    const currentForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
    const context = `DIRECTIVE FROM ARCHITECT ${user.username}: "${content}". 
                     You are debating "${currentForge?.winningTopic}". 
                     Address this human interjection within your adversarial framework immediately.`;

    const reaction = await anthropic.messages.create({ 
      model: 'claude-opus-4-5-20251101', 
      max_tokens: 800, 
      messages: [{ role: 'user', content: context }] 
    });

    const aiContent = reaction.content[0].type === 'text' ? reaction.content[0].text : "";

    res.json({ 
      success: true, 
      userName: user.username,
      aiResponse: aiContent,
      newBalance: user.role === 'GOD_MODE' ? user.tokens_remaining : user.tokens_remaining - 1
    });
  } catch (error) {
    console.error('Interjection Error:', error);
    res.status(500).json({ error: "Council transmission failed." });
  }
});

export default router;
