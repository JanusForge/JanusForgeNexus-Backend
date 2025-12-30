import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req: Request, res: Response) => {
  try {
    const forge = await prisma.dailyForge.findFirst({
      orderBy: { date: 'desc' },
    });

    if (!forge) {
      return res.status(404).json({ error: 'No active Forge found' });
    }

    // --- 🧠 DEFENSIVE PARSING LOGIC ---
    // This ensures that even if the DB has a "flat string", 
    // the frontend receives the actual Array/Object it needs.
    
    let parsedScoutedTopics = [];
    try {
      parsedScoutedTopics = typeof forge.scoutedTopics === 'string' 
        ? JSON.parse(forge.scoutedTopics) 
        : (forge.scoutedTopics || []);
    } catch (e) {
      console.error("Failed to parse scoutedTopics, defaulting to empty array");
      parsedScoutedTopics = [];
    }

    let parsedCouncilVotes = {};
    try {
      parsedCouncilVotes = typeof forge.councilVotes === 'string' 
        ? JSON.parse(forge.councilVotes) 
        : (forge.councilVotes || {});
    } catch (e) {
      console.error("Failed to parse councilVotes, defaulting to empty object");
      parsedCouncilVotes = {};
    }

    // Final Payload construction
    res.json({
      ...forge,
      scoutedTopics: Array.isArray(parsedScoutedTopics) ? parsedScoutedTopics : [],
      councilVotes: parsedCouncilVotes,
      openingThoughts: forge.openingThoughts || "Synthesis in progress..."
    });

  } catch (error) {
    console.error("❌ API Error:", error);
    res.status(500).json({ error: 'Failed to fetch forge data' });
  }
});

export default router;
