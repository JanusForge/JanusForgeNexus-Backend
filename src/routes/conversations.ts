// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

/**
 * GET /api/conversations/user
 * Populates Neural History and Chrono Vault.
 */
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || userId === 'undefined') {
        return res.status(400).json({ error: 'Valid User ID required' });
    }

    const uid = String(userId);
    console.log(`[STABILITY MODE] Fetching history for: ${uid}`);

    // Direct fetch - works now that RLS is disabled in SQL
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
      title: conv.title || (conv.is_daily_forge ? "Daily Forge Archive" : "Synthesis"),
      is_daily_forge: conv.is_daily_forge,
      timestamp: conv.created_at,
      preview: conv.posts[0]?.content?.substring(0, 80) + "..." || "Archived content"
    })));
  } catch (error: any) {
    console.error('HISTORY CRASH:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/conversations/:conversationId/posts
 * Handles 'Initialize' and 'Deploy' actions.
 */
router.post('/:conversationId/posts', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId, is_human } = req.body;

    if (!content || !userId) return res.status(400).json({ error: 'Missing content/userId' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Admin/Owner Bypass
    const isOwner = user.email === 'admin@janusforge.ai' || user.role === 'GOD_MODE';
    
    const [post, updatedUser] = await prisma.$transaction(async (tx) => {
      // Auto-claim conversation ownership
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
          data: { tokens_remaining: { decrement: 3 } }
        });
      }

      return [newPost, await tx.user.findUnique({ where: { id: userId } })];
    });

    const currentTokens = isOwner ? 999999 : updatedUser!.tokens_remaining;
    
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
    }).catch(e => console.error('AI Error:', e));

    res.status(201).json({ success: true, tokens_remaining: currentTokens });
  } catch (error: any) {
    console.error('POST CRASH:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
