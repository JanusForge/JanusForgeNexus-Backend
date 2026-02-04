import express from 'express';
import { prisma } from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

router.post('/ignite', async (req: any, res) => {
  const { prompt, models, userId, conversationId, institution } = req.body;
  const io = req.app.get('socketio');

  try {
    // 1. NEON HANDSHAKE
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    let targetConversationId = conversationId;

    // 2. CREATE CONVERSATION IN NEON (Force explicit Null for Nexus)
    if (!targetConversationId || targetConversationId.startsWith('nexus-temp')) {
      const newConv = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: !institution,
          institution_id: institution || null, 
          title: prompt.substring(0, 50),
          council_members: ["GPT", "CLAUDE", "GEMINI"] as any 
        }
      });
      targetConversationId = newConv.id;
    }

    const userPost = await prisma.post.create({
      data: {
        content: prompt,
        user_id: currentUser.id,
        conversation_id: targetConversationId,
        is_human: true,
        name: currentUser.username || "Sovereign Node"
      }
    });

    // 3. BROADCAST (Global for Nexus, Card-specific for Hubs)
    if (institution) {
      io.emit(`node:${institution}:transmission`, userPost);
    } else {
      io.emit('nexus:transmission', userPost);
    }

    res.json({ success: true, conversationId: targetConversationId });

    // 4. AI DISCOURSE (Neon-Only)
    const council = ["GPT4", "CLAUDE", "GEMINI"]; 
    for (const model of council) {
      try {
        let aiContent = "";
        // Using your exact Hub keys that we know work
        if (model === "GPT4") {
           const chat = await aiClients.GPT4.chat.completions.create({ model: "gpt-4o", messages: [{role:"user", content: prompt}]});
           aiContent = chat.choices[0].message.content || "";
        } else if (model === "CLAUDE") {
           const msg = await aiClients.CLAUDE.messages.create({ model: "claude-3-5-sonnet-20240620", max_tokens: 1024, messages: [{role:"user", content: prompt}]});
           aiContent = msg.content[0].type === 'text' ? msg.content[0].text : "";
        }

        if (aiContent) {
          const aiPost = await prisma.post.create({
            data: {
              content: aiContent,
              conversation_id: targetConversationId,
              is_human: false,
              name: model,
              ai_model: model as any
            }
          });

          if (institution) {
            io.emit(`node:${institution}:transmission`, aiPost);
          } else {
            io.emit('nexus:transmission', aiPost);
          }
        }
      } catch (e) { console.error("Council Member failed:", e); }
    }
  } catch (error: any) { console.error("Nexus Ignite Error:", error); }
});

router.get('/stream', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      where: { conversation: { institution_id: null }, is_human: true },
      orderBy: { created_at: 'desc' },
      take: 50
    });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: "Stream Error" }); }
});

export default router;
