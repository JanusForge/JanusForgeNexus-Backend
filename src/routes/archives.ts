// src/routes/archives.ts
import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * RESTORES: fetch(`${API_BASE_URL}/api/archives/history`)
 * This populates the Chrono-Vault sidebar.
 */
router.get('/history', async (req, res) => {
  try {
    const vaultItems = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      take: 50
    });
    res.json(vaultItems);
  } catch (error) {
    res.status(500).json({ error: "History currently unavailable" });
  }
});

export default router;
