// src/routes/conversations.ts
import { Router, Response, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest, PostRequest } from '../types';
import { requireTier } from '../middleware/auth';
import {
  getAvailableModelsForTier,
  calculateAICost,
  getTierConfiguration
} from '../services/tierService';

const router = Router();
const prisma = new PrismaClient();

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
        content: "The Janus Forge Nexus is officially ONLINE. Awaiting your first command.",
        tier: 'enterprise'
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
                username: true,
                tier: true
              }
            },
            ai_response: {
              select: {
                ai_model: true,
                processing_time: true
              }
            }
          },
          where: {
            OR: [
              { required_tier: null },
              { required_tier: req.user?.tier }
            ]
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
          where: {
            OR: [
              { required_tier: null },
              { required_tier: req.user?.tier }
            ]
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                tier: true
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
    const tierConfig = req.user ? getTierConfiguration(req.user.tier as any) : null;
    const availableModels = req.user ? getAvailableModelsForTier(req.user.tier as any) : [];
    res.json({
      conversation,
      tierInfo: tierConfig ? {
        tier: req.user?.tier,
        availableModels,
        tokenAllowance: tierConfig.tokenAllowance,
        features: tierConfig.features
      } : null
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new conversation
router.post('/', requireTier('BASIC'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    const { title } = req.body;
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { token_balance: true }
    });
    if (!user || user.token_balance < 10) {
      return res.status(402).json({ message: 'Insufficient tokens' });
    }
    const conversation = await prisma.conversation.create({
      data: {
        title: title.trim(),
        is_daily_forge: false
      }
    });
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { token_balance: { decrement: 10 } }
    });
    await prisma.tokenTransaction.create({
      data: {
        user_id: req.user.userId,
        amount: -10,
        transaction_type: 'conversation_creation',
        description: `Created conversation: ${title}`
      }
    });
    const io = req.app.get('io');
    io.emit('conversation:new', conversation);
    res.status(201).json({ conversation });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new post in conversation
router.post('/:id/posts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    const { id: conversationId } = req.params;
    const { content, parentPostId }: PostRequest = req.body;
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { token_balance: true, tier: true }
    });
    if (!user || user.token_balance < 1) {
      return res.status(402).json({ message: 'Insufficient tokens' });
    }
    const post = await prisma.post.create({
      data: {
        content: content.trim(),
        is_human: true,
        user_id: req.user.userId,
        conversation_id: conversationId,
        parent_post_id: parentPostId || null,
        required_tier: req.user.tier
      },
      include: {
        user: { select: { id: true, username: true, tier: true } }
      }
    });
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { token_balance: { decrement: 1 } }
    });
    await prisma.tokenTransaction.create({
      data: {
        user_id: req.user.userId,
        amount: -1,
        transaction_type: 'post_creation',
        description: `Posted message`
      }
    });
    const availableModels = getAvailableModelsForTier(req.user.tier as any);
    const modelsToTrigger = availableModels.slice(0, req.user.tier === 'FREE' ? 2 : 3);
    for (const aiModel of modelsToTrigger) {
      const estimatedCost = calculateAICost(aiModel, 200);
      const aiResponseRecord = await prisma.aIResponse.create({
        data: {
          post_id: post.id,
          ai_model: aiModel as any,
          raw_response: 'Thinking...',
          processing_time: 0,
          tokens_used: 0,
          cost_cents: estimatedCost,
          user_id: req.user.userId
        }
      });
      setTimeout(async () => {
        const simulatedContent = `As ${aiModel}, I suggest we analyze the infrastructure implications.`;
        const finalAiPost = await prisma.post.create({
          data: {
            content: simulatedContent,
            is_human: false,
            conversation_id: conversationId,
            parent_post_id: post.id,
            ai_model: aiModel as any,
            required_tier: req.user?.tier || 'FREE'
          },
          include: { ai_response: true }
        });
        await prisma.aIResponse.update({
          where: { id: aiResponseRecord.id },
          data: { raw_response: simulatedContent, processing_time: 1500 }
        });
        const io = req.app.get('io');
        io.to(`conversation:${conversationId}`).emit('ai:response', { post: finalAiPost });
      }, 2000);
    }
    res.status(201).json({ post });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
