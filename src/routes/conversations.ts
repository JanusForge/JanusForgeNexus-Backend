// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

/**
 * GET /api/conversations/user
 * Populates sidebars. Uses transaction to set identity for RLS.
 */
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const uid = String(userId);

    // Keep session setting and data query on the same connection
    const conversations = await prisma.$transaction(async (tx) => {
      // Local session initialization for restricted DB users
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_id', '${uid}', true)`);
      
      return await tx.conversation.findMany({
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
    });

    res.json(conversations.map(conv => ({
      id: conv.id,
      title: conv.title || (conv.is_daily_forge ? "Daily Forge" : "Synthesis"),
      isDailyForge: conv.is_daily_forge,
      timestamp: conv.created_at,
      preview: conv.posts[0]?.content?.substring(0, 80) + "..." || "No content"
    })));
  } catch (error: any) {
    console.error('RLS GET ERROR:', error.message);
    res.status(500).json({ error: 'Database session error' });
  }
});

/**
 * POST /api/conversations/:conversationId/posts
 * Secure interjection with Admin/God-Mode bypass.
 */
router.post('/:conversationId/posts', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId, is_human } = req.body;

    if (!content || !userId) return res.status(400).json({ error: 'Missing fields' });

    // 1. Ownership and User Verification
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return res.status(404).json({ error: 'Not found' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 2. God-Mode / Admin Bypass
    const isOwner = user.email === 'admin@janusforge.ai' || user.role === 'GOD_MODE';
    const DEBATE_COST = 3;

    if (!isOwner && user.tokens_remaining < DEBATE_COST) {
      return res.status(403).json({ error: 'Insufficient tokens' });
    }

    // 3. Perform Update and Post Creation in Transaction
    const [post, updatedUser] = await prisma.$transaction(async (tx) => {
      // Claim if unowned
      if (!conversation.user_id) {
        await tx.conversation.update({
          where: { id: conversationId },
          data: { user_id: userId }
        });
      }

      // Deduct tokens for non-admins
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

    // 4. Broadcast and AI Trigger
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

    triggerCouncilDebate({ 
      conversationId, 
      io, 
      currentTokens, 
      ...req.app.get('aiClients') 
    }).catch(e => console.error('AI Error:', e));

    res.status(201).json({ success: true, tokens_remaining: currentTokens });
  } catch (error: any) {
    console.error('POST ERROR:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Rename and Delete routes (Omitted for brevity, keep your existing versions)
export default router;
