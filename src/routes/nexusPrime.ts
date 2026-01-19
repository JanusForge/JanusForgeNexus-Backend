import express from 'express';
import prisma from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

/**
 * 🛰️ THE IGNITION GATEWAY (Social Edition)
 */
router.post('/ignite', async (req: any, res) => {
  const { prompt, models, userId, conversationId, parentPostId } = req.body;
  const io = req.app.get('socketio');

  try {
    let targetConversationId = conversationId;

    // --- 🛠️ ENUM MAPPING (Prevents 500 Error) ---
    // Maps frontend names to Prisma Enum names
    const modelMap: Record<string, AIParticipant> = {
      'CLAUDE': AIParticipant.CLAUDE,
      'GPT4': AIParticipant.CHATGPT,
      'GEMINI': AIParticipant.GEMINI_PRO,
      'GROK': AIParticipant.GROK,
      'DEEPSEEK': AIParticipant.DEEPSEEK
    };

    const validCouncilMembers = models
      .map((m: string) => modelMap[m])
      .filter((m: any) => m !== undefined);

    // 1. 🏗️ ARCHITECTURE CHECK
    if (!targetConversationId) {
      const newConversation = await prisma.conversation.create({
        data: {
          user_id: userId,
          is_public: true, 
          is_private: false,
          title: prompt.split(' ').slice(0, 5).join(' ') + "...",
          council_members: validCouncilMembers
        }
      });
      targetConversationId = newConversation.id;
    }

    // 2. 📝 RECORD HUMAN TRANSMISSION
    const userPost = await prisma.post.create({
      data: {
        content: prompt,
        user_id: userId,
        conversation_id: targetConversationId,
        parent_post_id: parentPostId || null,
        is_human: true,
        name: "Sovereign Node"
      }
    });

    // Broadcast user post (Using a global channel for simpler frontend sync)
    io.emit('nexus:transmission', userPost);
    if (!parentPostId) io.emit('nexus:new_root', userPost);

    // 3. 🧠 COUNCIL SYNTHESIS
    // We iterate through valid models and create responses
    for (const modelEnum of validCouncilMembers) {
      const aiPost = await prisma.post.create({
        data: {
          content: `[Synthesizing ${modelEnum}...]`, // Placeholder for actual logic
          conversation_id: targetConversationId,
          parent_post_id: userPost.id,
          is_human: false,
          name: modelEnum.toString(),
          ai_model: modelEnum
        }
      });

      io.emit('nexus:transmission', aiPost);
    }

    res.json({ success: true, conversationId: targetConversationId });

  } catch (error) {
    console.error("🚀 IGNITION CRITICAL FAILURE:", error);
    res.status(500).json({ error: "Neural link desynchronized." });
  }
});

/**
 * 📜 FEED HYDRATION
 */
router.get('/stream', async (req, res) => {
  try {
    const feed = await prisma.conversation.findMany({
      where: { is_public: true },
      include: {
        posts: {
          orderBy: { created_at: 'asc' } // Get all posts for simplicity in dev
        }
      },
      orderBy: { created_at: 'desc' }
    });

    // Flatten for the current frontend chatThread logic
    const flattenedMessages = feed.flatMap(conv => conv.posts);
    res.json(flattenedMessages);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch neural stream." });
  }
});

export default router;
