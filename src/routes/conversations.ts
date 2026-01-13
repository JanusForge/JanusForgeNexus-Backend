// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

/**
 * GET /api/conversations/user
 * Populates the 'Neural History' and 'Chrono Vault'.
 * Optimized for high-frequency page switching.
 */
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;

    // Guard against malformed requests from the frontend
    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ error: 'A valid User ID is required' });
    }

    const uid = String(userId);

    // Fetch the owner's history
    const conversations = await prisma.conversation.findMany({
      where: { user_id: uid },
      orderBy: { created_at: 'desc' },
      take: 100, // Limit to prevent 500 errors from massive data loads
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

    // Stabilize the connection with a no-cache header to prevent browser loop-backs
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    
    res.json(conversations.map(conv => ({
      id: conv.id,
      title: conv.title || (conv.is_daily_forge ? "Daily Forge Archive" : "Synthesis"),
      is_daily_forge: conv.is_daily_forge,
      timestamp: conv.created_at,
      preview: conv.posts[0]?.content?.substring(0, 80) + "..." || "No content available"
    })));
  } catch (error: any) {
    console.error('[CRITICAL] History Fetch Error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/conversations/:conversationId
 * Fetches the specific synthesis transcript.
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
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

/**
 * POST /api/conversations/:conversationId/posts
 * Handles 'Initialize' and 'Deploy' interjections.
 * Includes explicit God-Mode/Owner bypass.
 */
router.post('/:conversationId/posts', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId, is_human } = req.body;

    if (!content || !userId) return res.status(400).json({ error: 'Missing content or userId' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not recognized' });

    const isOwner = user.email === 'admin@janusforge.ai' || user.role === 'GOD_MODE';
    const DEBATE_COST = 3;

    if (!isOwner && user.tokens_remaining < DEBATE_COST) {
      return res.status(403).json({ error: 'Insufficient tokens' });
    }

    const [post, updatedUser] = await prisma.$transaction(async (tx) => {
      // Ensure the user claims ownership of the conversation
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

    const currentTokens = isOwner ? 999999 : (updatedUser as any).tokens_remaining;
    
    // Broadcast via Socket.io
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

    triggerCouncilDebate({ 
      conversationId, 
      io: req.app.get('io'), 
      currentTokens, 
      ...req.app.get('aiClients') 
    }).catch(e => console.error('AI Debate Error:', e.message));

    res.status(201).json({ success: true, tokens_remaining: currentTokens });
  } catch (error: any) {
    console.error('Interjection Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/conversations/:conversationId
 * Rename synthesis title.
 */
router.patch('/:conversationId', async (req, res) => {
  try {
    const updated = await prisma.conversation.update({
      where: { id: req.params.conversationId },
      data: { title: req.body.title }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Rename failed" });
  }
});

/**
 * DELETE /api/conversations/:conversationId
 * Archive/Delete synthesis.
 */
router.delete('/:conversationId', async (req, res) => {
  try {
    await prisma.conversation.delete({ where: { id: req.params.conversationId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
