import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/daily-forge/topic
router.get('/topic', async (req: Request, res: Response) => {
  try {
    // This is the "Operational" data the homepage is looking for
    const currentTopic = {
      id: 'forge-topic-active',
      title: 'Should AI development be globally regulated by a central authority?',
      description: 'Exploring the balance between innovation and safety in global AI governance.',
      source: 'AI Council Analysis',
      tags: ['AI Ethics', 'Governance', 'Global'],
      aiInterest: 92,
      humanInterest: 87,
      timestamp: new Date().toISOString(),
      nextUpdate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    res.json(currentTopic);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch the daily topic' });
  }
});

export default router;
