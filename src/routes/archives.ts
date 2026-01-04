import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET all archives (for archive page list + search)
router.get('/history', async (req: Response, res: Response) => {
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

// GET single archive by ID (for detail view)
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

export default router;
