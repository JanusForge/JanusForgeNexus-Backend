import express from 'express';
import prisma from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

/**
 * 🛰️ THE IGNITION GATEWAY (Social Edition)
 * Handles Root Patterns (New Threads) and Nested Replies.
 */
router.post('/ignite', async (req: any, res) => {
  const { prompt, models, userId, conversationId, parentPostId } = req.body;
  const io = req.app.get('socketio');

  try {
    let targetConversationId = conversationId;

    // 1. 🏗️ ARCHITECTURE CHECK: Is this a new thread or a reply?
    if (!targetConversationId) {
      // Create a new Public Conversation (The "Root Card" on the feed)
      const newConversation = await prisma.conversation.create({
        data: {
          user_id: userId,
          is_public: true, // This makes it visible on the global feed
          is_private: false,
          title: prompt.split(' ').slice(0, 5).join(' ') + "...", // Cinematic auto-title
          council_members: models as AIParticipant[]
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
        parent_post_id: parentPostId || null, // Link to specific reply if provided
        is_human: true,
        name: "Sovereign Node" // Or user's actual username
      }
    });

    // Broadcast user post immediately to the specific thread
    io.emit(`nexus:transmission:${targetConversationId}`, userPost);
    // Also broadcast to the global feed so people see a "New Pattern" was started
    if (!parentPostId) io.emit('nexus:new_root', userPost);

    // 3. 🧠 COUNCIL SYNTHESIS (AI RESPONSES)
    // We trigger AI for each selected model
    for (const model of models) {
      // Process AI response logic here (calling aiClients based on 'model')
      // For brevity, assuming your AI worker handles the actual generation
      
      const aiPost = await prisma.post.create({
        data: {
          content: `[Synthesizing ${model}...]`, // Placeholder for actual AI content
          conversation_id: targetConversationId,
          parent_post_id: userPost.id, // AI always replies to the prompt that triggered it
          is_human: false,
          name: model,
          ai_model: model as AIParticipant
        }
      });

      io.emit(`nexus:transmission:${targetConversationId}`, aiPost);
    }

    res.json({ success: true, conversationId: targetConversationId });

  } catch (error) {
    console.error("🚀 IGNITION CRITICAL FAILURE:", error);
    res.status(500).json({ error: "Neural link desynchronized." });
  }
});

/**
 * 📜 FEED HYDRATION
 * Fetches the global list of "Root" conversations for the public panel.
 */
router.get('/stream', async (req, res) => {
  try {
    const feed = await prisma.conversation.findMany({
      where: { is_public: true },
      include: {
        posts: {
          where: { parent_post_id: null }, // Only get the "First Post" of each thread
          take: 1,
          orderBy: { created_at: 'desc' }
        },
        _count: {
          select: { posts: true } // Show how many replies are inside
        }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(feed);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch neural stream." });
  }
});

export default router;
