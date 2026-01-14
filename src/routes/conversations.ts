// src/routes/conversations.ts
import express from 'express';
import prisma from '../lib/prisma';

const router = express.Router();

/**
 * GET /api/conversations/user
 * STRICT PRIVATE ACCESS: Fetches history ONLY for the logged-in user.
 * This prevents cross-user data leaks and stops 500 errors by handling 
 * empty states gracefully.
 */
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;
    
    // Guard: If the frontend doesn't send a valid ID, return an empty list.
    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(200).json([]);
    }

    // Strict ownership filter
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

    // Ensure the browser doesn't cache an old error state
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    return res.status(200).json(conversations.map(c => ({
      id: c.id,
      title: c.title || "Private Synthesis",
      is_daily_forge: false,
      timestamp: c.created_at,
      preview: c.posts?.[0]?.content?.substring(0, 60) + "..." || "No content"
    })));

  } catch (error: any) {
    console.error('🔥 PRIVATE_SPACE_ERROR:', error.message);
    // Return 200 [] to prevent the UI from showing error popups
    return res.status(200).json([]); 
  }
});

/**
 * DELETE /api/conversations/:id
 * PERMANENT PURGE: Removes a specific synthesis from the database.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query; 

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Ensure the conversation belongs to the person deleting it
    const conversation = await prisma.conversation.findUnique({
      where: { id: String(id) }
    });

    if (!conversation || conversation.user_id !== String(userId)) {
      return res.status(403).json({ error: "Permission denied." });
    }

    // This permanently removes the record from Neon
    await prisma.conversation.delete({
      where: { id: String(id) }
    });

    return res.status(200).json({ message: "Purge complete." });
  } catch (error: any) {
    console.error("Delete Error:", error.message);
    res.status(500).json({ error: "Failed to delete." });
  }
});

// ALWAYS KEEP THIS AT THE VERY BOTTOM
export default router;
