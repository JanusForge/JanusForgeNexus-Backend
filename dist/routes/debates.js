import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();
// Get active daily forge debate
router.get('/active', async (req, res) => {
    try {
        const debate = await prisma.conversation.findFirst({
            where: {
                is_daily_forge: true,
                expires_at: { gt: new Date() }
            },
            include: {
                posts: {
                    where: {
                        OR: [
                            { required_tier: null },
                            { required_tier: req.user?.tier }
                        ]
                    },
                    include: {
                        user: { select: { username: true, tier: true } },
                        ai_response: true
                    },
                    orderBy: { created_at: 'asc' }
                }
            }
        });
        if (!debate) {
            return res.status(404).json({ message: 'No active debate found' });
        }
        res.json(debate);
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Vote for an AI model in a debate
router.post('/:id/vote', async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Not authenticated' });
        const { id: conversationId } = req.params;
        const { aiModel, score } = req.body;
        const vote = await prisma.debateVote.upsert({
            where: {
                user_id_conversation_id_ai_model: {
                    user_id: req.user.userId,
                    conversation_id: conversationId,
                    ai_model: aiModel
                }
            },
            update: { score },
            create: {
                user_id: req.user.userId,
                conversation_id: conversationId,
                ai_model: aiModel,
                score
            }
        });
        res.json({ message: 'Vote recorded', vote });
    }
    catch (error) {
        res.status(500).json({ message: 'Error recording vote' });
    }
});
// Get debate results/standings
router.get('/:id/results', async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const votes = await prisma.debateVote.groupBy({
            by: ['ai_model'],
            where: { conversation_id: conversationId },
            _avg: { score: true },
            _count: { _all: true }
        });
        const postCounts = await prisma.post.groupBy({
            by: ['ai_model'],
            where: {
                conversation_id: conversationId,
                is_human: false
            },
            _count: { _all: true }
        });
        const results = votes.map(vote => {
            const posts = postCounts.find(p => p.ai_model === vote.ai_model);
            return {
                aiModel: vote.ai_model,
                averageScore: vote._avg?.score || 0,
                voteCount: vote._count?._all || 0,
                postCount: posts?._count?._all || 0
            };
        });
        res.json({ results });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching results' });
    }
});
export default router;
