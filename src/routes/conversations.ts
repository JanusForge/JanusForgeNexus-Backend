// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';
import { triggerCouncilDebate } from '../lib/councilDebate';

const router = express.Router();

// GET HISTORY
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || userId === 'undefined') return res.status(400).send("No ID");

    // No transactions, no RLS, just a straight query
    const conversations = await prisma.conversation.findMany({
      where: { user_id: String(userId) },
      orderBy: { created_at: 'desc' },
      include: { posts: { take: 1, orderBy: { created_at: 'asc' } } }
    });

    res.json(conversations.map(c => ({
      id: c.id,
      title: c.title || "Untitled",
      is_daily_forge: c.is_daily_forge,
      timestamp: c.created_at,
      preview: c.posts[0]?.content?.substring(0, 50) + "..."
    })));
  } catch (error) {
    console.error("HISTORY ERROR:", error);
    res.status(500).send("Server Error");
  }
});

// POST CONTENT
router.post('/:conversationId/posts', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId } = req.body;

    // Direct update: Ensure the conversation belongs to you
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

    // Broadcast immediately
    req.app.get('io').to(conversationId).emit('post:incoming', {
      ...post,
      name: post.user.username,
      sender: 'user'
    });

    // Trigger AI
    triggerCouncilDebate({
      conversationId,
      io: req.app.get('io'),
      currentTokens: 999999,
      ...req.app.get('aiClients')
    }).catch(e => console.error("AI Error", e));

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("POST ERROR:", error);
    res.status(500).send("Server Error");
  }
});

export default router;
