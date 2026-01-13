// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

/**
 * GET /api/conversations/user
 * Fetches the user's isolated history.
 * Enforces Row-Level Security (RLS) via a database transaction.
 */
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const uid = String(userId);
    console.log(`[PRIVACY SYNC] Fetching history for ID: "${uid}"`);

    /**
     * On Render/Production, we use a single transaction to ensure the session 
     * variable and the query share the same database connection.
     */
    const conversations = await prisma.$transaction(async (tx) => {
      // Set the session variable for the current DB connection
      await tx.$executeRawUnsafe(`SET LOCAL app.current_user_id = '${uid}'`);
      
      return await tx.conversation.findMany({
        where: { 
          user_id: uid // Filter by the TEXT column mapping
        },
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
    });

    console.log(`[PRIVACY SYNC] Isolated results found: ${conversations.length}`);

    const formatted = conversations.map(conv => ({
      id: conv.id,
      title: conv.title || (conv.is_daily_forge ? "Daily Forge Archive" : "Untitled Synthesis"),
      is_daily_forge: conv.is_daily_forge,
      timestamp: conv.created_at,
      preview: conv.posts[0]?.content?.substring(0, 80) + "..." || "Archived content"
    }));

    res.json(formatted);
  } catch (error: any) {
    console.error('CRITICAL SIDEBAR ERROR:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/conversations/:conversationId
 * Fetches the full transcript for a specific synthesis.
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

    if (!conversation) return res.status(404).json({ error: 'Not found' });

    res.json({ conversation });
  } catch (error: any) {
    console.error('GET /conversations/:conversationId error:', error);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

/**
 * POST /api/conversations/:conversationId/posts
 * Handles user input and ensures 'user_id' ownership is recorded.
 */
router.post('/:conversationId/posts', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId, is_human } = req.body;

    if (!content || !userId) return res.status(400).json({ error: 'Missing fields' });

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return res.status(404).json({ error: 'Not found' });

    // CLAIM LOGIC: If unowned, this user becomes the owner
    if (!conversation.user_id) {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { user_id: userId }
        });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Admin Bypass Logic (admin@janusforge.ai)
    const isOwner = user.email === 'admin@janusforge.ai' || user.role === 'GOD_MODE';
    const DEBATE_COST = 3;

    if (!isOwner && user.tokens_remaining < DEBATE_COST) {
      return res.status(403).json({ error: 'Insufficient tokens' });
    }

    const [post, updatedUser] = await prisma.$transaction(async (tx) => {
      if (!isOwner) {
        await tx.user.update({
          where: { id: userId },
          data: {
            tokens_remaining: { decrement: DEBATE_COST },
            tokens_used: { increment: DEBATE_COST }
          }
        });
      }

      const newPost = await tx.post.create({
        data: {
          content,
          is_human: is_human !== false,
          user_id: userId,
          conversation_id: conversationId
        },
        include: { user: true }
      });

      return [newPost, await tx.user.findUnique({ where: { id: userId } })];
    });

    const currentTokens = isOwner ? 999999 : updatedUser!.tokens_remaining;
    const io = req.app.get('io');
    const aiClients = req.app.get('aiClients');

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

    triggerCouncilDebate({ conversationId, io, currentTokens, ...aiClients })
      .catch(err => console.error('[Council Error]', err));

    res.status(201).json({ success: true, tokens_remaining: currentTokens });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/conversations/:conversationId
 * Sidebar Rename Functionality.
 */
router.patch('/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { title } = req.body;
        const updated = await prisma.conversation.update({
            where: { id: conversationId },
            data: { title }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: "Rename failed" });
    }
});

/**
 * DELETE /api/conversations/:conversationId
 * Sidebar Delete Functionality.
 */
router.delete('/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        await prisma.conversation.delete({ where: { id: conversationId } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Delete failed" });
    }
});

export default router;
