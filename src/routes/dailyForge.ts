import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { scoutNewTopic } from '../scripts/aiScout'; // Direct import - now exported

const router = Router();
// DEBUG: Log what URL we're using
console.log('🔧 dailyForge.ts - Prisma Client Initialization:');
console.log(' DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log(' Using pooler:', process.env.DATABASE_URL?.includes('-pooler.'));
// FIXED: Create Prisma client WITH pooler configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL // CRITICAL: Use pooler URL
    }
  },
  log: ['info', 'error', 'warn'] // Enable info logs to see connection
});
// Get current Daily Forge
router.get('/current', async (req, res) => {
  console.log('📞 GET /api/daily-forge/current');
  try {
    const current = await prisma.dailyForge.findFirst({
      orderBy: { date: 'desc' }
    });
    console.log('🔍 Found current forge:', current ? 'Yes' : 'No');
    if (!current) {
      return res.status(404).json({ error: 'No current Daily Forge found' });
    }
    res.json(current);
  } catch (err) {
    console.error('❌ Current Daily Forge error:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});
// Get history
router.get('/history', async (req, res) => {
  console.log('📜 GET /api/daily-forge/history');
  try {
    const history = await prisma.dailyForge.findMany({
      orderBy: { date: 'desc' },
      take: 30
    });
    console.log(`📊 Found ${history.length} history items`);
    res.json(history);
  } catch (err) {
    console.error('❌ Daily Forge history error:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});
// NEW: Force new topic + full cycle (GOD_MODE only)
// Triggers scout → create forge → vote → initial debate → update
router.post('/force-new-topic', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    if (!user || user.role !== 'GOD_MODE') {
      return res.status(403).json({ error: 'GOD_MODE required' });
    }
    console.log('GOD_MODE admin forcing new topic + full cycle...');
    // Get today's date (midnight EST in UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    // Step 1: Scout new topics
    console.log('Starting scout for forced topic...');
    const topics = await scoutNewTopic();
    if (topics.length === 0) throw new Error('Failed to generate topics');
    console.log(`Scouted ${topics.length} topics successfully`);
    // Create new forge
    const newForge = await prisma.dailyForge.create({
      data: {
        date: today,
        scoutedTopics: JSON.stringify(topics),
        winningTopic: "",
        councilVotes: "{}",
        phase: 'TOPIC_SELECTION'
      }
    });
    console.log(`New forge created: ${newForge.id}`);
    // Step 2: Run vote
    const votes = await runCouncilVote(newForge.id); // Import from aiVoteAndDebate
    const winningTopic = tallyVotes(votes); // Import
    // Step 3: Run initial debate
    const openingThoughts = await runInitialDebate(winningTopic); // Import
    // Create conversation and update forge
    const conversation = await prisma.conversation.create({
      data: { title: winningTopic, is_daily_forge: true }
    });
    await prisma.dailyForge.update({
      where: { id: newForge.id },
      data: {
        winningTopic,
        councilVotes: JSON.stringify(votes),
        openingThoughts: JSON.stringify(openingThoughts),
        conversationId: conversation.id,
        phase: 'CONVERSATION'
      }
    });
    console.log('Full cycle complete - new forge ready');
    res.json({ success: true, message: 'New topic + full cycle forced', newForge });
  } catch (error) {
    console.error('Force new topic error:', error);
    res.status(500).json({ error: 'Failed to force new topic' });
  }
});
export default router;
