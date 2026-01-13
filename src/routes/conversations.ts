// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;
    
    // Define your Admin UUID
    const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440000';
    const isAdmin = userId === ADMIN_ID;

    const conversations = await prisma.conversation.findMany({
      where: isAdmin 
        ? {} // GOD MODE: If it's you, don't filter by ID (pulls all 59+)
        : { user_id: String(userId) }, // USER MODE: Only pull their own stuff
      orderBy: { created_at: 'desc' },
      take: 100,
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
      title: c.title || (c.is_daily_forge ? "Daily Forge" : "Synthesis"),
      is_daily_forge: c.is_daily_forge,
      timestamp: c.created_at,
      preview: c.posts?.[0]?.content?.substring(0, 60) + "..." || ""
    })));

  } catch (error: any) {
    console.error('History Fetch Error:', error.message);
    return res.status(200).json([]); 
  }
});

export default router;
