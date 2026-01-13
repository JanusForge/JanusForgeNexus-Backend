// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

// GET /api/conversations/:conversationId
// Public endpoint - anyone can view Daily Forge conversations
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

// POST /api/conversations/:conversationId/posts
// Protected endpoint - Used by Daily Forge for interjections
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

    console.log(`[Daily Forge] Interjection by ${user.username} (Admin: ${isOwner})`);

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

export default router;
