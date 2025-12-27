import { Router, Response } from 'express';
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

// 1. MOVE PREVIEW HERE (Before the /:id route)
router.get('/preview', async (req: Request, res: Response) => {
  try {
    // Return mock data for now to satisfy the frontend
    const latestConversations = [
      {
        id: 'msg-101',
        sender: 'ai',
        avatar: '🤖',
        name: 'Councilor JANUS-7',
        role: 'Ethics Specialist',
        content: "The centralized model offers safety, but we must weigh it against the speed of innovation.",
        timestamp: 'Just now',
        tier: 'enterprise',
        likes: 12,
        replies: 4
      }
    ];

    res.json(latestConversations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load conversation feed' });
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
              { requiredTier: null },
              { requiredTier: req.user?.tier }
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
            aiResponse: {
              select: {
                aiModel: true,
                processingTime: true,
                tokensUsed: true,
                costCents: true
              }
            },
            _count: {
              select: { replies: true }
            }
          },
          orderBy: { createdAt: 'asc' },
          skip,
          take: limitNum
        },
        _count: {
          select: { posts: true }
        }
      }
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Get user's tier info to show available AI models
    const tierConfig = req.user ? getTierConfiguration(req.user.tier) : null;
    const availableModels = req.user ? getAvailableModelsForTier(req.user.tier) : [];

    res.json({
      conversation,
      tierInfo: tierConfig ? {
        tier: req.user?.tier,
        availableModels,
        tokenAllowance: tierConfig.tokenAllowance,
        features: tierConfig.features
      } : null,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: conversation._count.posts,
        pages: Math.ceil(conversation._count.posts / limitNum)
      }
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new conversation
router.post('/', requireTier('BASIC'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { title } = req.body;

    if (!title || title.trim().length < 3) {
      return res.status(400).json({ message: 'Title must be at least 3 characters' });
    }

    // Check token balance (requires tokens to create conversation)
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { tokenBalance: true }
    });

    if (!user || user.tokenBalance < 10) {
      return res.status(402).json({ 
        message: 'Insufficient tokens to create conversation',
        required: 10,
        available: user?.tokenBalance || 0
      });
    }

    const conversation = await prisma.conversation.create({
      data: {
        title: title.trim(),
        isDailyForge: false
      },
      include: {
        posts: true
      }
    });

    // Deduct tokens
    await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        tokenBalance: { decrement: 10 }
      }
    });

    // Create token transaction record
    await prisma.tokenTransaction.create({
      data: {
        userId: req.user.userId,
        amount: -10,
        transactionType: 'conversation_creation',
        description: `Created conversation: ${title}`
      }
    });

    // Notify via WebSocket
    const io = req.app.get('io');
    io.emit('conversation:new', conversation);

    res.status(201).json({
      message: 'Conversation created successfully',
      conversation,
      tokensDeducted: 10
    });

  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new post in conversation (triggers AI responses based on tier)
router.post('/:id/posts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { id: conversationId } = req.params;
    const { content, parentPostId }: PostRequest = req.body;

    // Validation
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Content is required' });
    }

    if (content.length > 5000) {
      return res.status(400).json({ message: 'Content too long (max 5000 characters)' });
    }

    // Check if conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Check token balance
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { tokenBalance: true, tier: true }
    });

    if (!user || user.tokenBalance < 1) {
      return res.status(402).json({ 
        message: 'Insufficient tokens to post',
        required: 1,
        available: user?.tokenBalance || 0
      });
    }

    // Create the post
    const post = await prisma.post.create({
      data: {
        content: content.trim(),
        isHuman: true,
        userId: req.user.userId,
        conversationId,
        parentPostId: parentPostId || null,
        requiredTier: req.user.tier
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            tier: true
          }
        }
      }
    });

    // Deduct 1 token for posting
    await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        tokenBalance: { decrement: 1 }
      }
    });

    // Create token transaction for posting
    await prisma.tokenTransaction.create({
      data: {
        userId: req.user.userId,
        amount: -1,
        transactionType: 'post_creation',
        description: `Posted in conversation: ${conversation.title || conversationId}`
      }
    });

    // Get available AI models for user's tier
    const availableModels = getAvailableModelsForTier(req.user.tier as any);
    const tierConfig = getTierConfiguration(req.user.tier as any);
    
    // Trigger AI responses based on tier
    if (availableModels.length > 0) {
      console.log(`🎯 User ${req.user.userId} (${req.user.tier}) posted.`);
      console.log(`   Available AI models (${availableModels.length}):`, availableModels);
      
      // For Free tier: Only trigger 2 AI responses
      // For Basic tier: Trigger 3 AI responses  
      // For Professional: Trigger all 5 AI responses
      // For Enterprise: Custom configuration (trigger all by default)
      
      const modelsToTrigger = availableModels.slice(0, 
        req.user.tier === 'FREE' ? 2 : 
        req.user.tier === 'BASIC' ? 3 : 
        availableModels.length
      );
      
      console.log(`   Triggering ${modelsToTrigger.length} AI responses:`, modelsToTrigger);
      
      // Create AI response placeholders
      for (const aiModel of modelsToTrigger) {
        const estimatedTokens = 200; // Estimated response length
        const estimatedCost = calculateAICost(aiModel, estimatedTokens);
        
        const aiResponse = await prisma.aIResponse.create({
          data: {
            postId: post.id,
            aiModel: aiModel,
            rawResponse: 'AI response is being generated...',
            processingTime: 0,
            tokensUsed: 0,
            costCents: estimatedCost,
            userId: req.user.userId
          }
        });
        
        console.log(`   ⏳ Queued ${aiModel} response (est. cost: $${(estimatedCost/100).toFixed(2)})`);
        
        // In production, this would add to a job queue
        // For now, we'll simulate with a timeout
        setTimeout(async () => {
          try {
            // Simulate AI response generation
            const finalTokens = 150 + Math.floor(Math.random() * 100);
            const finalCost = calculateAICost(aiModel, finalTokens);
            const responses = [
              `As ${aiModel}, I'd like to add to this discussion by considering...`,
              `${aiModel} here. The user raises an interesting point. From my perspective...`,
              `This is ${aiModel} responding. I believe the key insight here is...`,
              `${aiModel} weighing in: There are several factors to consider here...`
            ];
            
            const simulatedResponse = responses[Math.floor(Math.random() * responses.length)];
            
            await prisma.aIResponse.update({
              where: { id: aiResponse.id },
              data: {
                rawResponse: simulatedResponse,
                processingTime: 1000 + Math.floor(Math.random() * 2000),
                tokensUsed: finalTokens,
                costCents: finalCost
              }
            });
            
            // Create AI response post
            const aiPost = await prisma.post.create({
              data: {
                content: simulatedResponse,
                isHuman: false,
                conversationId,
                parentPostId: post.id,
                aiModel: aiModel,
                requiredTier: req.user.tier
              },
              include: {
                aiResponse: true
              }
            });
            
            // Notify via WebSocket
            const io = req.app.get('io');
            io.to(`conversation:${conversationId}`).emit('ai:response', {
              post: aiPost,
              originalPostId: post.id,
              aiModel,
              processingTime: aiPost.aiResponse?.processingTime,
              costCents: aiPost.aiResponse?.costCents
            });
            
            console.log(`   ✅ ${aiModel} response complete (cost: $${(finalCost/100).toFixed(2)})`);
            
          } catch (error) {
            console.error(`Error simulating ${aiModel} response:`, error);
          }
        }, 2000 + (Math.random() * 3000)); // Random delay 2-5 seconds
      }
    }

    // Notify via WebSocket about the human post
    const io = req.app.get('io');
    io.to(`conversation:${conversationId}`).emit('post:new', {
      ...post,
      aiModelsTriggered: availableModels.slice(0, 
        req.user.tier === 'FREE' ? 2 : 
        req.user.tier === 'BASIC' ? 3 : 
        availableModels.length
      )
    });

    res.status(201).json({
      message: 'Post created successfully',
      post,
      tokensDeducted: 1,
      tierInfo: {
        tier: req.user.tier,
        availableModels,
        modelsTriggered: availableModels.slice(0, 
          req.user.tier === 'FREE' ? 2 : 
          req.user.tier === 'BASIC' ? 3 : 
          availableModels.length
        ),
        tokenAllowance: tierConfig.tokenAllowance
      }
    });

  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Like a post
router.post('/posts/:postId/like', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { postId } = req.params;

    const post = await prisma.post.update({
      where: { id: postId },
      data: {
        likes: { increment: 1 }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });

    // Notify via WebSocket
    const io = req.app.get('io');
    io.emit('post:liked', {
      postId,
      likes: post.likes,
      userId: req.user.userId
    });

    res.json({
      message: 'Post liked',
      postId,
      likes: post.likes
    });

  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/conversations/preview
router.get('/preview', async (req: Request, res: Response) => {
  try {
    // Eventually, this will use your DATABASE_URL to pull real posts
    const latestConversations = [
      {
        id: 'msg-101',
        sender: 'ai',
        avatar: '🤖',
        name: 'Councilor JANUS-7',
        role: 'Ethics Specialist',
        content: "The centralized model offers safety, but we must weigh it against the speed of innovation.",
        timestamp: 'Just now',
        tier: 'enterprise',
        likes: 12,
        replies: 4
      }
    ];

    res.json(latestConversations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load conversation feed' });
  }
});

export default router;
