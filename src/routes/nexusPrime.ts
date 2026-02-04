import express from 'express';
import { prisma } from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

const COUNCIL_CONFIG = {
  "GPT4": { enum: AIParticipant.GPT },
  "CLAUDE": { enum: AIParticipant.CLAUDE },
  "GEMINI": { enum: AIParticipant.GEMINI },
  "GROK": { enum: AIParticipant.GROK },
  "DEEPSEEK": { enum: AIParticipant.DEEPSEEK }
};

router.post('/ignite', async (req: any, res) => {
  const { prompt, userId, conversationId, institution } = req.body;
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    let targetId = conversationId;

    if (!targetId || targetId.startsWith('nexus-temp')) {
      const newConv = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: !institution,
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
        name: currentUser.username || "Sovereign Node"
      }
    });

    // DUPLICATE FIX: Return response without io.emit(userPost)
    res.json({ success: true, conversationId: targetId, userPost });

    // 🚀 RESTORING THE RANDOMIZED SHUFFLE
    const councilKeys = ["GPT4", "CLAUDE", "GEMINI", "GROK", "DEEPSEEK"];
    for (let i = councilKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [councilKeys[i], councilKeys[j]] = [councilKeys[j], councilKeys[i]];
    }
    
    let rollingHistory = `User (${currentUser.username}): ${prompt}\n\n`;

    for (const key of councilKeys) {
      try {
        const config = COUNCIL_CONFIG[key as keyof typeof COUNCIL_CONFIG];
        let aiResponse = "";

        const systemInstructions = `
          IDENTITY: You are ${key}, a member of the Janus Forge Sovereign Council.
          MISSION: Engage in high-fidelity, in-depth philosophical discourse.
          CONTEXT: You can see the full discussion so far. Acknowledge and build upon or challenge previous members.
          RULES: No fluff. Minimum 3 paragraphs. Detailed synthesis. 
          SHUFFLE STATUS: You are speaking in position ${councilKeys.indexOf(key) + 1} of 5.
          
          DISCUSSION HISTORY:
          ${rollingHistory}
          
          YOUR TURN, ${key}:
        `;

        if (key === "GPT4") {
          const chat = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4o",
            max_tokens: 1200,
            messages: [{ role: "system", content: systemInstructions }]
          });
          aiResponse = chat.choices[0].message.content || "";
        } else if (key === "CLAUDE") {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-3-5-sonnet-latest",
            max_tokens: 1200,
            messages: [{ role: "user", content: systemInstructions }]
          });
          aiResponse = msg.content[0].type === 'text' ? msg.content[0].text : "";
        } else if (key === "GEMINI") {
          const result = await aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" }).generateContent(systemInstructions);
          aiResponse = result.response.text();
        } else if (key === "GROK") {
          const chat = await aiClients.GROK.chat.completions.create({
            model: "grok-beta",
            messages: [{ role: "user", content: systemInstructions }]
          });
          aiResponse = chat.choices[0].message.content || "";
        } else if (key === "DEEPSEEK") {
          const chat = await aiClients.DEEPSEEK.chat.completions.create({
            model: "deepseek-chat",
            max_tokens: 1200,
            messages: [{ role: "user", content: systemInstructions }]
          });
          aiResponse = chat.choices[0].message.content || "";
        }

        if (aiResponse) {
          const aiPost = await prisma.post.create({
            data: {
              content: aiResponse,
              conversation_id: targetId,
              parent_post_id: userPost.id,
              is_human: false,
              name: key,
              ai_model: config.enum
            }
          });

          rollingHistory += `${key}: ${aiResponse}\n\n`;

          io.emit(institution ? `node:${institution}:transmission` : 'nexus:transmission', aiPost);
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (err) { console.error(`${key} failure:`, err); }
    }
  } catch (error: any) { console.error("Ignite Error:", error); }
});

router.get('/stream', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      where: { conversation: { institution_id: null } },
      orderBy: { created_at: 'desc' },
      take: 40
    });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: "Stream error" }); }
});

export default router;
