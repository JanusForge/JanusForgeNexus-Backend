import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';

const router = Router();
const prisma = new PrismaClient();

// Enable CORS for frontend
router.use(cors({
  origin: ['https://janusforge.ai', 'https://www.janusforge.ai'],
  credentials: true
}));

// GET all archives
router.get('/history', async (req: Request, res: Response) => {
  try {
    const archives = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        winningTopic: true,
        openingThoughts: true
      }
    });
    res.json(archives);
  } catch (error) {
    console.error("Archive history fetch error:", error);
    res.status(500).json({ error: "Failed to load archives" });
  }
});

// GET single archive by ID
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const archive = await prisma.dailyForge.findUnique({
      where: { id },
      select: {
        id: true,
        date: true,
        winningTopic: true,
        openingThoughts: true
      }
    });
    if (!archive) {
      return res.status(404).json({ error: "Archive not found" });
    }
    res.json(archive);
  } catch (error) {
    console.error("Archive fetch error:", error);
    res.status(500).json({ error: "Failed to load archive" });
  }
});

// POST manual archive entry (GodMode only)
router.post('/manual', async (req: Request, res: Response) => {
  const { userId, winningTopic, openingThoughts } = req.body;

  if (!userId || !winningTopic || !openingThoughts) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'GOD_MODE') {
      return res.status(403).json({ error: "GodMode required" });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const entry = await prisma.dailyForge.create({
      data: {
        date: today,
        winningTopic,
        openingThoughts: typeof openingThoughts === 'string' ? openingThoughts : JSON.stringify(openingThoughts),
        scoutedTopics: "[]",
        councilVotes: "{}",
        phase: "MANUAL_ARCHIVE"
      }
    });

    res.json({ success: true, entry });
  } catch (error: any) {
    console.error("Manual archive error:", error);
    res.status(500).json({ error: "Failed to save archive entry" });
  }
});

export default router;
