// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

/**
 * GET /api/conversations/user
 * Populates 'Neural History' and 'Chrono Vault'.
 */
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || userId === 'undefined') return res.status(400).json({ error: 'Valid User ID required' });

    const uid = String(userId);
    console.log(`[BACKEND] Loading history for owner: ${uid}`);

    // Direct query without RLS session overhead
    const conversations = await prisma.conversation.findMany({
      where: { user_id: uid },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        is_daily_forge: true,
        created_at: true,
        posts: { take: 1, orderBy: { created_at: 'asc' }, select: { content: true } }
      }
    });

    res.json(conversations.map(conv => ({
      id: conv.id,
      title: conv.title || (conv.is_daily_forge ? "Daily Forge" : "Synthesis"),
      is_daily_forge: conv.is_daily_forge,
      timestamp: conv.created_at,
      preview: conv.posts[0]?.content?.substring(0, 80) + "..." || "Archived content"
    })));
  } catch (error: any) {
    console.error('HISTORY FETCH ERROR:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/conversations/:conversationId/posts
 * Handles user interjections and claims ownership.
 */
router.post('/:conversationId/posts', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId, is_human } = req.body;

    if (!content || !userId) return res.status(400).json({ error: 'Missing content/userId' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // God-Mode / Admin Bypass
    const isOwner = user.email === 'admin@janusforge.ai' || user.role === 'GOD_MODE';
    const DEBATE_COST = 3;

    if (!isOwner && user.tokens_remaining < DEBATE_COST) {
      return res.status(403).json({ error: 'Insufficient tokens' });
    }

    const [post, updatedUser] = await prisma.$transaction(async (tx) => {
      // Force assign ownership to the interjecting user
      await tx.conversation.update({
        where: { id: conversationId },
        data: { user_id: userId }
      });

      const newPost = await tx.post.create({
        data: {
          content,
          is_human: is_human !== false,
          user_id: userId,
          conversation_id: conversationId
        },
        include: { user: true }
      });

      if (!isOwner) {
        await tx.user.update({
          where: { id: userId },
          data: { tokens_remaining: { decrement: DEBATE_COST } }
        });
      }

      return [newPost, await tx.user.findUnique({ where: { id: userId } })];
    });

    const currentTokens = isOwner ? 999999 : updatedUser!.tokens_remaining;
    
    // Immediate Socket Broadcast so it appears in the thread
    req.app.get('io').to(conversationId).emit('post:incoming', {
      id: post.id,
      name: user.username,
      content: post.content,
      sender: 'user',
      role: user.role,
      tokens_remaining: currentTokens,
      created_at: post.created_at,
      conversationId
    });

    triggerCouncilDebate({ conversationId, io: req.app.get('io'), currentTokens, ...req.app.get('aiClients') })
      .catch(e => console.error('AI Error:', e));

    res.status(201).json({ success: true, tokens_remaining: currentTokens });
  } catch (error: any) {
    console.error('POST ERROR:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
