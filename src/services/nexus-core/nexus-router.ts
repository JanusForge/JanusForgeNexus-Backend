import { Router } from 'express';
import prisma from '../../lib/prisma';
import { runAdversarialSynthesis } from './synthesis-engine';

const router = Router();

/**
 * 🛡️ Identity Recovery Helper
 */
const extractIdentity = (req: any) => {
  return req.query.userId || req.body.userId || req.body.user_id || req.headers['x-user-id'];
};

const MASTER_EMAIL = 'admin@janusforge.ai';
const COST_PER_MODEL = 5;

/**
 * 🚀 SYNTHESIS IGNITION
 */
const handleSynthesis = async (req: any, res: any) => {
  const { prompt, selectedModels = ['CLAUDE', 'GPT4', 'GEMINI', 'GROK', 'DEEPSEEK'] } = req.body;
  const userId = extractIdentity(req);

  if (!userId) return res.status(401).json({ error: "Identity Required." });

  try {
    // 1. Force database connection wake-up for Neon cold-starts
    await prisma.$connect();

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found." });

    const isMaster = user.email.toLowerCase() === MASTER_EMAIL || user.tier === 'ENTERPRISE';
    const totalCost = selectedModels.length * COST_PER_MODEL;

    if (!isMaster && user.tokens_remaining < totalCost) {
      return res.status(403).json({ error: "Insufficient tokens." });
    }

    const conversation = await prisma.conversation.create({
      data: {
        user_id: userId,
        title: prompt.substring(0, 30) + "...",
        name: "Nexus Prime",
        is_private: true
      }
    });

    runAdversarialSynthesis({
      conversationId: conversation.id,
      prompt,
      selectedModels,
      io: req.app.get('io'),
      isMaster
    });

    res.json({ 
      conversationId: conversation.id,
      tokens_remaining: isMaster ? 999789 : (user.tokens_remaining - totalCost)
    });

  } catch (err: any) {
    console.error("🔴 NEXUS SYNTHESIS ERROR:", err.message);
    res.status(500).json({ error: "Database timeout. Please try again." });
  }
};

/**
 * 📚 PRIVATE HISTORY SYNC
 */
const handleHistory = async (req: any, res: any) => {
  const userId = extractIdentity(req);
  
  if (!userId) {
    return res.json([]); // Return empty rather than 500
  }

  try {
    await prisma.$connect();
    const history = await prisma.conversation.findMany({
      where: { 
        user_id: userId,
        name: "Nexus Prime" 
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(history);
  } catch (err: any) {
    console.error("🔴 NEXUS HISTORY ERROR:", err.message);
    res.status(200).json([]); // Return empty list on error to keep UI from crashing
  }
};

// --- ROUTES ---
router.post('/synthesis', handleSynthesis);
router.get('/history', handleHistory);

// --- LEGACY ALIASES (Fixed the 500 errors) ---
router.post('/', handleSynthesis); 
router.get('/', handleHistory);

export default router;
