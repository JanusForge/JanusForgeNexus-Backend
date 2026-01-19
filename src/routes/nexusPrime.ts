// src/routes/nexusPrime.ts (Full Restoration)

import express from 'express';
import prisma from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

router.post('/ignite', async (req: any, res) => {
  const { prompt, models, userId, conversationId, parentPostId } = req.body;
  const io = req.app.get('socketio');

  try {
    let targetConversationId = conversationId;

    // 🛠️ ALIGNMENT MAP
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

    if (!targetConversationId) {
      const newConversation = await prisma.conversation.create({
        data: {
          user_id: userId,
          is_public: true,
          title: prompt.substring(0, 50),
          council_members: validCouncilMembers
        }
      });
      targetConversationId = newConversation.id;
    }

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

    io.emit('nexus:transmission', userPost);
    if (!parentPostId) io.emit('nexus:new_root', userPost);

    // Return early to the UI
    res.json({ success: true, conversationId: targetConversationId });

    // 🧠 ACTIVATE VOICES (REAL AI CALLS)
    for (const modelEnum of validCouncilMembers) {
      try {
        let aiContent = "";

        if (modelEnum === AIParticipant.CLAUDE) {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          });
          aiContent = msg.content[0].text;
        } else if (modelEnum === AIParticipant.CHATGPT) {
          const comp = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
          });
          aiContent = comp.choices[0].message.content || "";
        } else if (modelEnum === AIParticipant.GEMINI_PRO) {
          const model = aiClients.GEMINI.getGenerativeModel({ model: "gemini-pro" });
          const result = await model.generateContent(prompt);
          aiContent = result.response.text();
        } else if (modelEnum === AIParticipant.GROK) {
            const comp = await aiClients.GROK.chat.completions.create({
                model: "grok-beta",
                messages: [{ role: "user", content: prompt }]
            });
            aiContent = comp.choices[0].message.content || "";
        } else if (modelEnum === AIParticipant.DEEPSEEK) {
            const comp = await aiClients.DEEPSEEK.chat.completions.create({
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }]
            });
            aiContent = comp.choices[0].message.content || "";
        }

        const aiPost = await prisma.post.create({
          data: {
            content: aiContent,
            conversation_id: targetConversationId,
            parent_post_id: userPost.id,
            is_human: false,
            name: modelEnum.toString(),
            ai_model: modelEnum
          }
        });
        io.emit('nexus:transmission', aiPost);
      } catch (err) {
        console.error(`Error with ${modelEnum}:`, err);
      }
    }
  } catch (error) {
    console.error("Ignition Error:", error);
    if (!res.headersSent) res.status(500).send("Sync Error");
  }
});

router.get('/stream', async (req, res) => {
  try {
    const feed = await prisma.conversation.findMany({
      where: { is_public: true },
      include: { posts: { orderBy: { created_at: 'asc' } } },
      orderBy: { created_at: 'desc' }
    });
    res.json(feed.flatMap(f => f.posts));
  } catch (err) { res.status(500).send("Stream Error"); }
});

export default router;
