// src/routes/conversations.ts
import { Router, Response, Request } from 'express';
import { PrismaClient, AIParticipant } from '@prisma/client';
import { AuthenticatedRequest } from '../types';

const router = Router();

// === Personal User Conversation History ===
router.get('/user', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.status(400).json({ error: "userId required" });
  }
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { posts: { some: { user_id: userId } } },
          { title: "Live Nexus Chat" }
        ]
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        created_at: true,
        posts: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { content: true, created_at: true }
        }
      }
    });
    const formatted = conversations.map(conv => ({
      id: conv.id,
      title: conv.title || "Untitled Synthesis",
      preview: conv.posts[0]?.content?.slice(0, 80) + "..." || "No messages yet",
      timestamp: conv.posts[0]?.created_at || conv.created_at
    }));
    res.json(formatted);
  } catch (error) {
    console.error("Conversation list error:", error);
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

// === Update conversation title (PATCH) ===
router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title } = req.body;
  try {
    const updated = await prisma.conversation.update({
      where: { id },
      data: { title },
      select: { id: true, title: true }
    });
    res.json(updated);
  } catch (error) {
    console.error("Conversation update error:", error);
    res.status(500).json({ error: "Failed to update conversation" });
  }
});

// GET /api/conversations/preview
router.get('/preview', async (req: Request, res: Response) => {
  res.json({
    success: true,
    conversations: [
      {
        id: 'initial-1',
        sender: 'ai',
        name: 'Councilor JANUS-7',
        content: "The Janus Forge Nexus is officially ONLINE. Awaiting your first command."
      }
    ]
  });
});

// Get all conversations (for feed)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { is_daily_forge: false },
          { is_daily_forge: true, expires_at: { gt: new Date() } }
        ]
      },
      include: {
        posts: {
          take: 5,
          orderBy: { created_at: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            },
            ai_response: {
              select: {
                ai_model: true,
                processing_time: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take: limitNum
    });
    const total = await prisma.conversation.count();
    res.json({
      conversations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get single conversation with posts
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        posts: {
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            },
            ai_response: {
              select: {
                ai_model: true,
                processing_time: true,
                tokens_used: true,
                cost_cents: true
              }
            }
          },
          orderBy: { created_at: 'asc' },
          skip,
          take: limitNum
        }
      }
    });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    res.json({ conversation });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new conversation — ANY authenticated user with tokens can create
router.post('/', async (req: Request, res: Response) => {
  const { title, userId } = req.body;
  if (!userId) {
    return res.status(401).json({ message: 'User ID required' });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { token_balance: true }
    });
    if (!user || user.token_balance < 10) {
      return res.status(402).json({ message: 'Insufficient tokens' });
    }
    const conversation = await prisma.conversation.create({
      data: {
        title: title?.trim() || "New Live Conversation",
        is_daily_forge: false
      }
    });
    await prisma.user.update({
      where: { id: userId },
      data: { token_balance: { decrement: 10 } }
    });
    await prisma.tokenTransaction.create({
      data: {
        user_id: userId,
        amount: -10,
        transaction_type: 'conversation_creation',
        description: `Created conversation: ${title || 'New Live Conversation'}`
      }
    });
    const io = req.app.get('io');
    io.emit('conversation:new', conversation);
    res.status(201).json({ conversation });
  } catch (error) {
    console.error("Conversation creation error:", error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new post in conversation
router.post('/:id/posts', async (req: Request, res: Response) => {
  const { id: conversationId } = req.params;
  const { content, userId } = req.body;
  if (!userId) {
    return res.status(401).json({ message: 'User ID required' });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { token_balance: true }
    });
    if (!user || user.token_balance < 1) {
      return res.status(402).json({ message: 'Insufficient tokens' });
    }
    const post = await prisma.post.create({
      data: {
        content: content.trim(),
        is_human: true,
        user_id: userId,
        conversation_id: conversationId
      },
      include: {
        user: { select: { id: true, username: true } }
      }
    });
    await prisma.user.update({
      where: { id: userId },
      data: { token_balance: { decrement: 1 } }
    });
    await prisma.tokenTransaction.create({
      data: {
        user_id: userId,
        amount: -1,
        transaction_type: 'post_creation',
        description: 'Posted message'
      }
    });
    // Full council for all users - use correct enum values
    const fullCouncil = [
      AIParticipant.GEMINI,
      AIParticipant.DEEPSEEK,
      AIParticipant.GROK,
      AIParticipant.CLAUDE,
      AIParticipant.CHATGPT
    ];
    for (const aiEnum of fullCouncil) {
      const aiPost = await prisma.post.create({
        data: {
          content: `[${aiEnum} responding...]`,
          is_human: false,
          ai_model: aiEnum,  // Use enum value directly
          conversation_id: conversationId,
          parent_post_id: post.id
        }
      });
      const io = req.app.get('io');
      io.to(`conversation:${conversationId}`).emit('post:incoming', {
        id: aiPost.id,
        name: aiEnum,
        content: `[${aiEnum} responding...]`,
        sender: 'ai',
        tokens_remaining: user.token_balance - 1
      });
    }
    res.status(201).json({ post });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
export default router;


// Keep it Clean - CLW
