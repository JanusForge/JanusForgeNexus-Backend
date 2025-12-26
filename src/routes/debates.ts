import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { requireTier } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get today's Daily Forge debate
router.get('/daily-forge', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find or create today's debate
    let debate = await prisma.conversation.findFirst({
      where: {
        isDailyForge: true,
        forgeDate: {
          gte: today,
          lt: tomorrow
        }
      },
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
                tokensUsed: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    // If no debate exists for today, create one (admin/scheduled job would do this)
    if (!debate) {
      const topics = [
        "The ethical implications of AI in creative industries",
        "Should AI have legal personhood?",
        "The future of human-AI collaboration",
        "Privacy vs. AI advancement: where should we draw the line?",
        "Can AI truly understand human emotions?"
      ];
      
      const randomTopic = topics[Math.floor(Math.random() * topics.length)];
      
      debate = await prisma.conversation.create({
        data: {
          title: `Daily Forge: ${randomTopic}`,
          isDailyForge: true,
          dailyTopic: randomTopic,
          forgeDate: today,
          expiresAt: tomorrow,
          councilMembers: ['GPT4', 'CLAUDE2', 'GEMINI_PRO'] // Default council
        },
        include: {
          posts: true
        }
      });

      // Create initial AI council posts
      const councilPosts = [
        {
          content: `As GPT-4, I believe this topic requires careful consideration of both technological capabilities and ethical boundaries. The key question is...`,
          aiModel: 'GPT4',
          requiredTier: 'PRO'
        },
        {
          content: `Claude here. From my perspective, the human element in this discussion cannot be overstated. We must consider...`,
          aiModel: 'CLAUDE2',
          requiredTier: 'PRO'
        },
        {
          content: `Gemini Pro weighing in. The technical aspects suggest one direction, but societal implications point elsewhere. My analysis shows...`,
          aiModel: 'GEMINI_PRO',
          requiredTier: 'PRO'
        }
      ];

      for (const postData of councilPosts) {
        const post = await prisma.post.create({
          data: {
            content: postData.content,
            isHuman: false,
            conversationId: debate.id,
            aiModel: postData.aiModel as any,
            requiredTier: postData.requiredTier as any
          }
        });

        await prisma.aIResponse.create({
          data: {
            postId: post.id,
            aiModel: postData.aiModel as any,
            rawResponse: postData.content,
            processingTime: 1500,
            tokensUsed: 200,
            userId: req.user?.userId || 'system'
          }
        });
      }
    }

    // Calculate time until next debate
    const now = new Date();
    const nextDebate = new Date(tomorrow);
    const hoursUntilNext = Math.floor((nextDebate.getTime() - now.getTime()) / (1000 * 60 * 60));
    const minutesUntilNext = Math.floor((nextDebate.getTime() - now.getTime()) / (1000 * 60)) % 60;

    res.json({
      debate,
      timing: {
        currentTime: now.toISOString(),
        nextDebate: tomorrow.toISOString(),
        countdown: {
          hours: hoursUntilNext,
          minutes: minutesUntilNext,
          totalMinutes: hoursUntilNext * 60 + minutesUntilNext
        }
      }
    });

  } catch (error) {
    console.error('Get daily forge error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Vote on an AI's argument in the debate
router.post('/:debateId/vote', requireTier('BASIC'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { debateId } = req.params;
    const { aiModel, score } = req.body;

    // Validation
    if (!aiModel || !score || score < 1 || score > 5) {
      return res.status(400).json({ 
        message: 'Valid aiModel and score (1-5) are required' 
      });
    }

    // Check if debate exists and is a Daily Forge
    const debate = await prisma.conversation.findUnique({
      where: { 
        id: debateId,
        isDailyForge: true 
      }
    });

    if (!debate) {
      return res.status(404).json({ message: 'Daily Forge debate not found' });
    }

    // Check if user already voted for this AI in this debate
    const existingVote = await prisma.debateVote.findUnique({
      where: {
        userId_conversationId_aiModel: {
          userId: req.user.userId,
          conversationId: debateId,
          aiModel: aiModel as any
        }
      }
    });

    let vote;
    if (existingVote) {
      // Update existing vote
      vote = await prisma.debateVote.update({
        where: { id: existingVote.id },
        data: { score }
      });
    } else {
      // Create new vote
      vote = await prisma.debateVote.create({
        data: {
          userId: req.user.userId,
          conversationId: debateId,
          aiModel: aiModel as any,
          score
        }
      });
    }

    // Calculate average scores for all AIs in this debate
    const allVotes = await prisma.debateVote.groupBy({
      by: ['aiModel'],
      where: { conversationId: debateId },
      _avg: { score: true },
      _count: { score: true }
    });

    // Notify via WebSocket
    const io = req.app.get('io');
    io.emit('debate:vote', {
      debateId,
      aiModel,
      score,
      userId: req.user.userId,
      averages: allVotes
    });

    res.json({
      message: existingVote ? 'Vote updated' : 'Vote recorded',
      vote,
      averages: allVotes
    });

  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get debate leaderboard
router.get('/:debateId/leaderboard', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { debateId } = req.params;

    const votes = await prisma.debateVote.groupBy({
      by: ['aiModel'],
      where: { conversationId: debateId },
      _avg: { score: true },
      _count: { score: true },
      orderBy: {
        _avg: {
          score: 'desc'
        }
      }
    });

    // Get AI post counts in this debate
    const aiPosts = await prisma.post.groupBy({
      by: ['aiModel'],
      where: { 
        conversationId: debateId,
        aiModel: { not: null }
      },
      _count: { id: true }
    });

    // Combine data
    const leaderboard = votes.map(vote => {
      const posts = aiPosts.find(p => p.aiModel === vote.aiModel);
      return {
        aiModel: vote.aiModel,
        averageScore: vote._avg.score,
        totalVotes: vote._count.score,
        totalPosts: posts?._count.id || 0
      };
    });

    res.json({ leaderboard });

  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
