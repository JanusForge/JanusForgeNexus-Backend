// src/routes/dailyForge.ts
import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

router.get('/vault', async (req, res) => {
  try {
    // PUBLIC ACCESS: No userId filter required for the Vault
    const vaultItems = await prisma.dailyForge.findMany({
      orderBy: { created_at: 'desc' },
      take: 100
    });

    res.json(vaultItems);
  } catch (error) {
    res.status(500).json({ error: "Public vault currently unavailable" });
  }
});

export default router;
