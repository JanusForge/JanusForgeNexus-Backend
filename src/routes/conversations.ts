// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

/**
 * GET /api/conversations/user
 * Resilient history fetch. Returns 200 [] instead of 500 to stop UI crashes.
 */
router.get('/user', async (req, res) => {
  const { userId } = req.query;
  
  try {
    // 1. Guard against malformed navigation requests
    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(200).json([]); 
    }

    const uid = String(userId);

    // 2. Race the DB query against a 4-second timeout to prevent server hangs
    const conversations = await Promise.race([
      prisma.conversation.findMany({
        where: { user_id: uid },
        orderBy: { created_at: 'desc' },
        take: 40,
        select: {
          id: true,
          title: true,
          is_daily_forge: true,
          created_at: true,
          posts: { take: 1, orderBy: { created_at: 'asc' }, select: { content: true } }
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 4000))
    ]) as any[];

    // 3. Set headers to ensure fresh data on every tab switch
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    return res.status(200).json((conversations || []).map(c => ({
      id: c.id,
      title: c.title || (c.is_daily_forge ? "Daily Forge Archive" : "Untitled Synthesis"),
      is_daily_forge: c.is_daily_forge,
      timestamp: c.created_at,
      preview: c.posts?.[0]?.content?.substring(0, 60) + "..." || "Archived content"
    })));

  } catch (error: any) {
    // 4. Log the error to Render but don't break the frontend
    console.error('🔥 RECOVERY: History Fetch Failed:', error.message);
    return res.status(200).json([]); 
  }
});

/**
 * POST /api/conversations/:conversationId/posts
 * Handles 'Initialize' and 'Deploy' interjections.
 */
router.post('/:conversationId/posts', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId } = req.body;

    if (!content || !userId) return res.status(400).json({ error: 'Missing data' });

    // Always ensure the conversation is linked to the user on every post
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { user_id: userId }
    });

    const post = await prisma.post.create({
      data: {
        content,
        user_id: userId,
        conversation_id: conversationId,
        is_human: true
      },
      include: { user: true }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(conversationId).emit('post:incoming', {
        id: post.id,
        name: post.user.username,
        content: post.content,
        sender: 'user',
        created_at: post.created_at,
        conversationId
      });
    }

    // Trigger AI without blocking the response
    triggerCouncilDebate({
      conversationId,
      io,
      currentTokens: 999999,
      ...req.app.get('aiClients')
    }).catch(e => console.error("🔥 AI ERROR:", e.message));

    return res.status(201).json({ success: true });
  } catch (error: any) {
    console.error('🔥 RECOVERY: Post Failed:', error.message);
    return res.status(200).json({ success: false, error: 'Database busy' });
  }
});

export default router;
