import { Router } from 'express';
import prisma from '../../lib/prisma';
import { runAdversarialSynthesis } from './synthesis-engine';

const router = Router();

/**
 * 🛡️ Identity Recovery Helper
 * Ensures the system finds the user regardless of frontend naming conventions.
 */
const extractIdentity = (req: any) => {
  return req.query.userId || req.body.userId || req.body.user_id || req.headers['x-user-id'];
};

/**
 * ⚖️ Economic Standards (2026 Frontier Cluster)
 * admin@janusforge.ai maintains a static 999,789 token balance.
 */
const MASTER_EMAIL = 'admin@janusforge.ai';
const COST_PER_MODEL = 5;

/**
 * 🚀 SYNTHESIS IGNITION
 * Handlers for: POST /api/nexus/synthesis AND POST /api/conversations/synthesis
 */
const handleSynthesis = async (req: any, res: any) => {
  const { prompt, selectedModels = ['CLAUDE', 'GPT4', 'GEMINI', 'GROK', 'DEEPSEEK'] } = req.body;
  const userId = extractIdentity(req);

  if (!userId) return res.status(401).json({ error: "Identity Required." });
  
  // Require at least 2 models for an "Adversarial" synthesis
  if (selectedModels.length < 2) {
    return res.status(400).json({ error: "Select at least 2 models for Nexus Prime." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User profile not found." });

    const isMaster = user.email.toLowerCase() === MASTER_EMAIL || user.tier === 'ENTERPRISE';
    const totalCost = selectedModels.length * COST_PER_MODEL;

    // 🛑 Token Gate: Skip for Master Authority
    if (!isMaster && user.tokens_remaining < totalCost) {
      return res.status(403).json({ 
        error: `Insufficient tokens. ${selectedModels.length} models require ${totalCost} tokens.` 
      });
    }

    // 🏗️ Create Isolated Synthesis Record
    const conversation = await prisma.conversation.create({
      data: {
        user_id: userId,
        title: prompt.substring(0, 30) + "...",
        name: "Nexus Prime", // FIREBREAK IDENTIFIER
        is_private: true     // FIRM PRIVACY LOCK
      }
    });

    // 🧠 Trigger the 5-AI Engine
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

  } catch (err) {
    console.error("NEXUS CORE ERROR:", err);
    res.status(500).json({ error: "Engine ignition failed. Database link resetting." });
  }
};

/**
 * 📚 PRIVATE HISTORY SYNC
 * Handlers for: GET /api/nexus/history AND GET /api/conversations
 */
const handleHistory = async (req: any, res: any) => {
  const userId = extractIdentity(req);
  if (!userId) return res.json([]);

  try {
    const history = await prisma.conversation.findMany({
      where: { 
        user_id: userId,
        name: "Nexus Prime" // Firebreak: Only retrieve synthesis threads
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "History synchronization failed." });
  }
};

// --- ROUTE REGISTRATION ---

// Modern Nexus Frontier
router.post('/synthesis', handleSynthesis);
router.get('/history', handleHistory);

// Legacy Handler Redirection (The Firebreak Bridge)
router.post('/', handleSynthesis); 
router.get('/', handleHistory);

export default router;
