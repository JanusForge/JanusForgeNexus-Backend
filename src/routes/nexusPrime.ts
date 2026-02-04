import express from 'express';
import { prisma } from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

router.post('/ignite', async (req: any, res) => {
  const { prompt, models, userId, conversationId, institution } = req.body;
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    let targetId = conversationId;

    if (!targetId || targetId.startsWith('nexus-temp')) {
      const newConv = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: true,
          institution_id: null,
          title: prompt.substring(0, 50),
          council_members: [AIParticipant.GPT, AIParticipant.CLAUDE, AIParticipant.GEMINI]
        }
      });
      targetId = newConv.id;
    }

    const userPost = await prisma.post.create({
      data: {
        content: prompt,
        user_id: currentUser.id,
        conversation_id: targetId,
        is_human: true,
        name: currentUser.username || "Node"
      }
    });

    io.emit('nexus:transmission', userPost);
    res.json({ success: true, conversationId: targetId });

    // 🚀 THE FIX: Mapping Frontend keys to your Schema Enums
    const COUNCIL_CONFIG = {
      "GPT4": { enum: AIParticipant.GPT, client: 'GPT4' },
      "CLAUDE": { enum: AIParticipant.CLAUDE, client: 'CLAUDE' },
      "GEMINI": { enum: AIParticipant.GEMINI, client: 'GEMINI' }
    };

    const selection = (models && models.length > 0) ? models : ["GPT4", "CLAUDE", "GEMINI"];

    for (const key of selection) {
      try {
        const config = COUNCIL_CONFIG[key as keyof typeof COUNCIL_CONFIG];
        if (!config) continue;

        let aiContent = "";
        const systemPrompt = `IDENTITY: ${key}. MISSION: Janus Forge Council. RULES: Concise. QUERY: ${prompt}`;

        if (key === "GPT4") {
          const chat = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: systemPrompt }]
          });
          aiContent = chat.choices[0].message.content || "";
        } else if (key === "CLAUDE") {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-3-5-sonnet-latest", // 🚀 FIXED: Prevents 404
            max_tokens: 1024,
            messages: [{ role: "user", content: systemPrompt }]
          });
          aiContent = msg.content[0].type === 'text' ? msg.content[0].text : "";
        } else if (key === "GEMINI") {
          const result = await aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" }).generateContent(systemPrompt);
          aiContent = result.response.text();
        }

        if (aiContent) {
          const aiPost = await prisma.post.create({
            data: {
              content: aiContent,
              conversation_id: targetId,
              parent_post_id: userPost.id,
              is_human: false,
              name: key,
              ai_model: config.enum // 🚀 FIXED: Passes 'GPT' (Enum) instead of 'GPT4' (String)
            }
          });
          io.emit('nexus:transmission', aiPost);
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err) { console.error(`${key} failure:`, err); }
    }
  } catch (error: any) { console.error("Ignite Error:", error); }
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
