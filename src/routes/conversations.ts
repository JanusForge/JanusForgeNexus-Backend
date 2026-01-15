import express from 'express';
import prisma from '../lib/prisma';
import { runAdversarialSynthesis } from '../lib/synthesisEngine';

const router = express.Router();

/**
 * POST /api/conversations/synthesis
 * The primary endpoint for Nexus Prime's private "Showdown" mode.
 * Integrates the 5-token cost model from the CouncilBuilder.
 */
router.post('/synthesis', async (req, res) => {
  const { userId, content, selectedModels = [] } = req.body;

  if (!userId || !content) {
    return res.status(400).json({ error: "Missing required identity or prompt data." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "Neural identity not found." });
    }

    // 🛡️ OWNER ACCESS: admin@janusforge.ai bypasses token costs
    const isOwner = user.email === 'admin@janusforge.ai' || user.role === 'GOD_MODE';
    
    // ✅ 5-Token Logic: Match the 'Darn Good Layout' economics
    const COST_PER_MODEL = 5;
    const modelCount = selectedModels.length > 0 ? selectedModels.length : 5; // Default to full council if unspecified
    const TOTAL_COST = modelCount * COST_PER_MODEL;

    // Token validation for regular users
    if (!isOwner && user.tokens_remaining < TOTAL_COST) {
      return res.status(403).json({ 
        error: `Insufficient tokens. This protocol requires ${TOTAL_COST} tokens for ${modelCount} models.` 
      });
    }

    // 1. Initialize the Private Conversation Thread
    // Uses 'title' as required by the schema
    const conversation = await prisma.conversation.create({
      data: {
        user_id: userId,
        title: content.substring(0, 45) + (content.length > 45 ? "..." : ""),
        is_private: true
      }
    });

    // 2. Save the User's Initial Directive/Prompt
    await prisma.post.create({
      data: {
        content,
        is_human: true,
        user_id: userId,
        conversation_id: conversation.id,
        name: user.username || 'Synthesizer'
      }
    });

    // 3. Process Token Deduction (unless Master Authority is active)
    if (!isOwner) {
      await prisma.user.update({
        where: { id: userId },
        data: { tokens_remaining: { decrement: TOTAL_COST } }
      });
    }

    // 4. Wake up the Cluster (AI Clients)
    const io = req.app.get('io');
    const aiClients = req.app.get('aiClients');

    // Trigger the automated adversarial dialogue in the background
    runAdversarialSynthesis({
      conversationId: conversation.id,
      prompt: content,
      selectedModels, // Pass selected models to the engine
      io,
      aiClients
    }).catch(err => console.error("Synthesis Chain Error:", err));

    // Send data back to frontend to trigger UI switch
    res.json({
      success: true,
      conversationId: conversation.id,
      tokens_remaining: isOwner ? 999999 : user.tokens_remaining - TOTAL_COST
    });

  } catch (error) {
    console.error("Critical Synthesis Failure:", error);
    res.status(500).json({ error: "The Synthesis Engine failed to initialize." });
  }
});

/**
 * GET /api/conversations/:id/posts
 * Retrieves the full transcript for the Nexus Prime main stage.
 */
router.get('/:id/posts', async (req, res) => {
  const { id } = req.params;

  try {
    const posts = await prisma.post.findMany({
      where: { conversation_id: id },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        content: true,
        name: true,
        sender: true,
        created_at: true,
        is_human: true
      }
    });

    // Map database structure to frontend "messages" format
    const formattedPosts = posts.map(post => ({
      id: post.id,
      content: post.content,
      name: post.is_human ? 'Synthesizer' : post.name,
      sender: post.is_human ? 'user' : 'ai',
      created_at: post.created_at
    }));

    res.json(formattedPosts);
  } catch (error) {
    console.error("Failed to retrieve synthesis history:", error);
    res.status(500).json({ error: "Could not load neural transcript." });
  }
});

/**
 * GET /api/conversations
 * Fetches private threads for the Neural History sidebar.
 */
router.get('/', async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: "User ID required" });

  try {
    const threads = await prisma.conversation.findMany({
      where: { 
        user_id: userId 
        // ✅ CRITICAL FIX: Removed the invalid 'name' argument
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        created_at: true,
        is_private: true
      }
    });
    res.json(threads);
  } catch (error) {
    console.error("History retrieval failed:", error);
    res.status(500).json({ error: "History retrieval failed" });
  }
});

export default router;
