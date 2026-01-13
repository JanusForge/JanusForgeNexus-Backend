import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import cors from 'cors';

const router = Router();

router.use(cors({
  origin: ['https://janusforge.ai', 'https://www.janusforge.ai'],
  credentials: true
}));

// GET all archives - optimized for sidebar and vault list
router.get('/history', async (req: Request, res: Response) => {
  try {
    const archives = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        winningTopic: true,
        conversationId: true // Added to link to full threads
      }
    });
    res.json(archives);
  } catch (error) {
    console.error("Archive history fetch error:", error);
    res.status(500).json({ error: "Failed to load archives" });
  }
});

// GET single archive by ID - for the deep-dive view
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const archive = await prisma.dailyForge.findUnique({
      where: { id },
      include: {
        // This allows us to pull the linked conversation and all its posts in one hit
        conversation: {
          include: {
            posts: { orderBy: { created_at: 'asc' } }
          }
        }
      }
    });
    if (!archive) return res.status(404).json({ error: "Archive not found" });
    res.json(archive);
  } catch (error) {
    console.error("Archive fetch error:", error);
    res.status(500).json({ error: "Failed to load archive" });
  }
});

// POST manual archive entry (Admin/GodMode only)
router.post('/manual', async (req: Request, res: Response) => {
  const { userId, winningTopic, openingThoughts } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    // Updated to include your email bypass
    if (!user || (user.role !== 'GOD_MODE' && user.email !== 'admin@janusforge.ai')) {
      return res.status(403).json({ error: "Unauthorized Protocol" });
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
    res.status(500).json({ error: "Failed to save archive entry" });
  }
});

export default router;
