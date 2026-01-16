import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

/**
 * GET /api/daily-forge/current
 * Loads the active topic and countdown data for the main page.
 */
router.get('/current', async (req, res) => {
  try {
    const currentForge = await prisma.dailyForge.findFirst({
      orderBy: { date: 'desc' },
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
 * GET /api/daily-forge/history
 * Populates the Chrono-Vault sidebar with past debates.
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

/**
 * POST /api/daily-forge/interject
 * Allows users to influence the live debate.
 * OWNER ACCESS: admin@janusforge.ai bypasses token costs.
 */
router.post('/interject', async (req, res) => {
  const { userId, conversationId, content } = req.body;

  if (!userId || !conversationId || !content) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    // OWNER BYPASS: Full unrestricted access for admin@janusforge.ai
    const isOwner = user.email === 'admin@janusforge.ai';
    const INTERJECTION_COST = 3;

    if (!isOwner && user.tokens_remaining < INTERJECTION_COST) {
      return res.status(403).json({ error: "Insufficient tokens for synthesis" });
    }

    // 1. Save the User's Post to the database
    const newPost = await prisma.post.create({
      data: {
        content,
        is_human: true,
        user_id: userId,
        conversation_id: conversationId
      }
    });

    // 2. Deduct Tokens if not the owner
    if (!isOwner) {
      await prisma.user.update({
        where: { id: userId },
        data: { tokens_remaining: { decrement: INTERJECTION_COST } }
      });
    }

    // 3. Broadcast to the room via Socket.io
    const io = req.app.get('io');
    const aiClients = req.app.get('aiClients');
    const currentTokens = isOwner ? 999999 : (user.tokens_remaining - INTERJECTION_COST);

    io.to(conversationId).emit('post:incoming', {
      id: newPost.id,
      name: user.username,
      content: newPost.content,
      sender: 'user',
      tokens_remaining: currentTokens,
      created_at: newPost.created_at,
      conversationId
    });

    // 4. Trigger the AI Council to respond to the interjection
    triggerCouncilDebate({ 
      conversationId, 
      io, 
      currentTokens, 
      ...aiClients 
    }).catch(err => console.error(`❌ Council Response Error:`, err));

    res.json({ success: true, post: newPost });
  } catch (error) {
    console.error("Interjection Error:", error);
    res.status(500).json({ error: "Failed to deploy interjection" });
  }
});

export default router;
