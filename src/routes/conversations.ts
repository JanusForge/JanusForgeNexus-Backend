// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

/**
 * GET /api/conversations/user
 * Fetches history specific to the logged-in user for the Neural History sidebar.
 */
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const conversations = await prisma.conversation.findMany({
      where: { user_id: String(userId) }, // Correct schema mapping from prisma/schema.prisma
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        created_at: true,
        posts: {
          take: 1,
          orderBy: { created_at: 'asc' },
          select: { content: true }
        }
      }
    });

    // Format for sidebar preview
    const formatted = conversations.map(conv => ({
      id: conv.id,
      title: conv.title || "Untitled Synthesis",
      timestamp: conv.created_at,
      preview: conv.posts[0]?.content?.substring(0, 100) + "..." || "No content yet"
    }));

    res.json(formatted);
  } catch (error: any) {
    console.error('GET /conversations/user error:', error);
    res.status(500).json({ error: 'Failed to fetch user history' });
  }
});

/**
 * GET /api/conversations/:conversationId
 * Public endpoint - anyone can view synthesis transcripts
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

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ conversation });
  } catch (error: any) {
    console.error('GET /conversations/:conversationId error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/**
 * POST /api/conversations/:conversationId/posts
 * Handles interjections and automatically assigns ownership if not already set.
 */
router.post('/:conversationId/posts', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId, is_human } = req.body;

    if (!content || !userId) {
      return res.status(400).json({ error: 'Missing required fields: content, userId' });
    }

    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Assign ownership to the conversation if it's currently orphaned
    if (!conversation.user_id) {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { user_id: userId }
        });
    }

    // Get user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // --- 🛡️ ADMIN BYPASS LOGIC ---
    const isOwner = user.email === 'admin@janusforge.ai' || user.role === 'GOD_MODE';
    const DEBATE_COST = 3;

    if (!isOwner && user.tokens_remaining < DEBATE_COST) {
      return res.status(403).json({
        error: 'Insufficient tokens',
        message: `This synthesis requires ${DEBATE_COST} tokens. Please purchase tokens to continue.`
      });
    }

    // Create post and handle tokens in a transaction
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

      const refreshedUser = await tx.user.findUnique({ where: { id: userId } });
      return [newPost, refreshedUser];
    });

    const currentTokens = isOwner ? 999999 : updatedUser!.tokens_remaining;

    // Get io and clients from app settings
    const io = req.app.get('io');
    const aiClients = req.app.get('aiClients');

    // Emit user's post to the room
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

    // Trigger AI Council (Async)
    triggerCouncilDebate({
      conversationId,
      io,
      currentTokens,
      ...aiClients
    }).catch(err => {
      console.error('[Daily Forge] Council error:', err);
    });

    res.status(201).json({
      success: true,
      tokens_remaining: currentTokens
    });

  } catch (error: any) {
    console.error('POST /conversations/:conversationId/posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/conversations/:conversationId
 * Allows renaming a synthesis.
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
        res.status(500).json({ error: "Failed to update title" });
    }
});

/**
 * DELETE /api/conversations/:conversationId
 * Removes a synthesis from history.
 */
router.delete('/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        await prisma.conversation.delete({
            where: { id: conversationId }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete synthesis" });
    }
});

export default router;
