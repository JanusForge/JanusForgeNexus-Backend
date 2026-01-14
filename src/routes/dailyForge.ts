// src/routes/dailyForge.ts
import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * RESTORES: fetch(`${API_BASE_URL}/api/daily-forge/current`)
 * This loads the active topic and the countdown on the main Daily Forge page.
 */
router.get('/current', async (req, res) => {
  try {
    const currentForge = await prisma.dailyForge.findFirst({
      orderBy: { date: 'desc' }, // 'date' matches your schema
    });

    if (!currentForge) {
      return res.status(404).json({ error: "No active forge found" });
    }

    res.json(currentForge);
  } catch (error) {
    console.error("Daily Forge Fetch Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * KEEPING THIS: Just in case you use it elsewhere
 */
router.get('/vault', async (req, res) => {
  try {
    const vaultItems = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      take: 100
    });
    res.json(vaultItems);
  } catch (error) {
    res.status(500).json({ error: "Public vault currently unavailable" });
  }
});

export default router;
