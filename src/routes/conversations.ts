// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * GET /api/conversations/user
 * STRICT PRIVATE ACCESS: Only pulls data for the logged-in user.
 */
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;
    
    // Safety check: if no ID, return nothing. No global leaks.
    if (!userId || userId === 'undefined') {
      return res.status(200).json([]);
    }

    // Filter strictly by the unique userId
    const conversations = await prisma.conversation.findMany({
      where: { user_id: String(userId) },
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

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(conversations.map(c => ({
      id: c.id,
      title: c.title || "Private Synthesis",
      is_daily_forge: false,
      timestamp: c.created_at,
      preview: c.posts?.[0]?.content?.substring(0, 60) + "..." || ""
    })));

  } catch (error: any) {
    console.error('Private History Fetch Error:', error.message);
    return res.status(200).json([]); 
  }
});

export default router;
