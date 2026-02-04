import express from 'express';
import { prisma } from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

const COUNCIL_CONFIG = {
  "GPT4": { enum: AIParticipant.GPT, client: 'GPT4' },
  "CLAUDE": { enum: AIParticipant.CLAUDE, client: 'CLAUDE' },
  "GEMINI": { enum: AIParticipant.GEMINI, client: 'GEMINI' },
  "GROK": { enum: AIParticipant.GROK, client: 'GROK' },
  "DEEPSEEK": { enum: AIParticipant.DEEPSEEK, client: 'DEEPSEEK' }
};

router.post('/ignite', async (req: any, res) => {
  const { prompt, models, userId, conversationId, institution } = req.body;
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    let targetId = conversationId;

    // 🚀 SYNC FIX: Ensure public visibility so the sidebar can recall it
    if (!targetId || targetId.startsWith('nexus-temp')) {
      const newConv = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: true, 
          is_private: false,
          institution_id: institution || null,
          title: prompt.substring(0, 50),
          council_members: [AIParticipant.GPT, AIParticipant.CLAUDE, AIParticipant.GEMINI, AIParticipant.GROK, AIParticipant.DEEPSEEK]
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

    // 🚀 THE COUNCIL LOOP: Forces all 5 to speak if selection is empty
    const selection = (models && models.length > 0) ? models : ["GPT4", "CLAUDE", "GEMINI", "GROK", "DEEPSEEK"];

    for (const key of selection) {
      try {
        const config = COUNCIL_CONFIG[key as keyof typeof COUNCIL_CONFIG];
        if (!config) continue;

        let aiContent = "";
        const systemPrompt = `IDENTITY: ${key}. MISSION: Janus Forge Council. RULES: Concise discourse. QUERY: ${prompt}`;

        if (key === "GPT4") {
          const chat = await aiClients.GPT4.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: systemPrompt }] });
          aiContent = chat.choices[0].message.content || "";
        } else if (key === "CLAUDE") {
          const msg = await aiClients.CLAUDE.messages.create({ model: "claude-3-5-sonnet-latest", max_tokens: 1024, messages: [{ role: "user", content: systemPrompt }] });
          aiContent = msg.content[0].type === 'text' ? msg.content[0].text : "";
        } else if (key === "GEMINI") {
          const result = await aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" }).generateContent(systemPrompt);
          aiContent = result.response.text();
        } else if (key === "GROK") {
          const chat = await aiClients.GROK.chat.completions.create({ model: "grok-beta", messages: [{ role: "user", content: systemPrompt }] });
          aiContent = chat.choices[0].message.content || "";
        } else if (key === "DEEPSEEK") {
          const chat = await aiClients.DEEPSEEK.chat.completions.create({ model: "deepseek-chat", messages: [{ role: "user", content: systemPrompt }] });
          aiContent = chat.choices[0].message.content || "";
        }

        if (aiContent) {
          const aiPost = await prisma.post.create({
            data: {
              content: aiContent,
              conversation_id: targetId,
              parent_post_id: userPost.id,
              is_human: false,
              name: key,
              ai_model: config.enum
            }
          });
          io.emit('nexus:transmission', aiPost);
          await new Promise(r => setTimeout(r, 1200));
        }
      } catch (err) { console.error(`${key} Node failure:`, err); }
    }
  } catch (error: any) { console.error("Ignite Error:", error); }
});

router.get('/stream', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      where: { conversation: { institution_id: null } }, 
      orderBy: { created_at: 'desc' },
      take: 50
    });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: "Archive unavailable" }); }
});

export default router;
