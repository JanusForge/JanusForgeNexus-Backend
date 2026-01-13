// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

/**
 * GET /api/conversations/user
 * Populates 'Neural History' and 'Chrono Vault'.
 * Simplified to remove RLS session overhead which causes 500s on Render.
 */
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const uid = String(userId);
    console.log(`[BACKEND] Fetching history for owner: ${uid}`);

    // Standard query without the RLS session wrapper
    const conversations = await prisma.conversation.findMany({
      where: { user_id: uid }, 
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        is_daily_forge: true,
        created_at: true,
        posts: {
          take: 1,
          orderBy: { created_at: 'asc' },
          select: { content: true }
        }
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
 * GET /api/conversations/:conversationId
 */
router.get('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        posts: {
          include: { user: true },
          orderBy: { created_at: 'asc' }
        }
      }
    });
    if (!conversation) return res.status(404).json({ error: 'Synthesis not found' });
    res.json({ conversation });
  } catch (error) {
    res.status(500).json({ error: 'Fetch error' });
  }
});

/**
 * POST /api/conversations/:conversationId/posts
 * Secure ownership and interjection logic.
 */
router.post('/:conversationId/posts', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId, is_human } = req.body;

    if (!content || !userId) return res.status(400).json({ error: 'Missing fields' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isOwner = user.email === 'admin@janusforge.ai' || user.role === 'GOD_MODE';
    const DEBATE_COST = 3;

    if (!isOwner && user.tokens_remaining < DEBATE_COST) {
      return res.status(403).json({ error: 'Insufficient tokens' });
    }

    const [post, updatedUser] = await prisma.$transaction(async (tx) => {
      // Auto-claim conversation for the user
      await tx.conversation.update({
        where: { id: conversationId },
        data: { user_id: userId }
      });

      if (!isOwner) {
        await tx.user.update({
          where: { id: userId },
          data: {
            tokens_remaining: { decrement: DEBATE_COST },
            tokens_used: { increment: DEBATE_COST }
          }
        });
      }

      return [
        await tx.post.create({
          data: {
            content,
            is_human: is_human !== false,
            user_id: userId,
            conversation_id: conversationId
          },
          include: { user: true }
        }),
        await tx.user.findUnique({ where: { id: userId } })
      ];
    });

    const currentTokens = isOwner ? 999999 : updatedUser!.tokens_remaining;
    const io = req.app.get('io');
    
    io.to(conversationId).emit('post:incoming', {
      id: post.id,
      name: user.username,
      content: post.content,
      sender: 'user',
      role: user.role,
      tokens_remaining: currentTokens,
      created_at: post.created_at,
      conversationId
    });

    triggerCouncilDebate({ conversationId, io, currentTokens, ...req.app.get('aiClients') })
      .catch(e => console.error('AI Error:', e));

    res.status(201).json({ success: true, tokens_remaining: currentTokens });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH & DELETE
router.patch('/:conversationId', async (req, res) => {
    try {
        const updated = await prisma.conversation.update({
            where: { id: req.params.conversationId },
            data: { title: req.body.title }
        });
        res.json(updated);
    } catch (error) { res.status(500).json({ error: "Rename failed" }); }
});

router.delete('/:conversationId', async (req, res) => {
    try {
        await prisma.conversation.delete({ where: { id: req.params.conversationId } });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Delete failed" }); }
});

export default router;
