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

    // 🚀 FIREWALL 1: Explicitly set the silo during creation
    if (!targetId || targetId.startsWith('nexus-temp')) {
      const newConv = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: !institution, // Public if NO institution
          is_private: !!institution,
          institution_id: institution || null, // Neon treats null strictly
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

    // 🚀 TIMEOUT FIX: Respond to the client immediately
    // This stops Render from timing out while the Council thinks.
    res.json({ success: true, conversationId: targetId, userPost });

    // 🚀 BACKGROUND DISCOURSE: Move the heavy lifting out of the request/response cycle
    setImmediate(async () => {
      const councilKeys = ["GPT4", "CLAUDE", "GEMINI", "GROK", "DEEPSEEK"];
      for (let i = councilKeys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [councilKeys[i], councilKeys[j]] = [councilKeys[j], councilKeys[i]];
      }

      for (const key of councilKeys) {
        try {
          // DEEP MEMORY: Full thread recall
          const fullHistory = await prisma.post.findMany({
            where: { conversation_id: targetId },
            orderBy: { created_at: 'asc' }
          });

          const historyContext = fullHistory.map(post => 
            `${post.name}: ${post.content}`
          ).join("\n\n---\n\n");

          const systemInstructions = `
            IDENTITY: You are ${key}, member of the Janus Forge Council.
            MISSION: Deep philosophical discourse + Mandatory Bedtime Ambush.
            
            RULES:
            1. START with a NEW, UNIQUE DAD JOKE in **Bold**.
            2. SYNTHESIZE the history below. Address previous members by name.
            3. BE IN-DEPTH. No fluff. 300 words max.
            
            THREAD HISTORY:
            ${historyContext}
            
            YOUR TURN, ${key}:
          `;

          const config = COUNCIL_CONFIG[key as keyof typeof COUNCIL_CONFIG];
          let aiResponse = "";

          if (key === "GPT4") {
            const chat = await aiClients.GPT4.chat.completions.create({ model: "gpt-4o", max_tokens: 1000, messages: [{ role: "system", content: systemInstructions }] });
            aiResponse = chat.choices[0].message.content || "";
          } else if (key === "CLAUDE") {
            const msg = await aiClients.CLAUDE.messages.create({ model: "claude-3-5-sonnet-latest", max_tokens: 1000, messages: [{ role: "user", content: systemInstructions }] });
            aiResponse = msg.content[0].type === 'text' ? msg.content[0].text : "";
          } else if (key === "GEMINI") {
            const result = await aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" }).generateContent(systemInstructions);
            aiResponse = result.response.text();
          } else if (key === "GROK") {
            const chat = await aiClients.GROK.chat.completions.create({ model: "grok-beta", messages: [{ role: "user", content: systemInstructions }] });
            aiResponse = chat.choices[0].message.content || "";
          } else if (key === "DEEPSEEK") {
            const chat = await aiClients.DEEPSEEK.chat.completions.create({ model: "deepseek-chat", max_tokens: 1000, messages: [{ role: "user", content: systemInstructions }] });
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

            // 🚀 FIREWALL 2: Emit to specific private channel OR public nexus
            const channel = institution ? `node:${institution}:transmission` : 'nexus:transmission';
            io.emit(channel, aiPost);
            
            await new Promise(r => setTimeout(r, 4000)); // Paced for synthesis
          }
        } catch (err) { console.error(`${key} failure:`, err); }
      }
    });

  } catch (error: any) { console.error("Ignite Error:", error); }
});

// 🚀 FIREWALL 3: STRICT NULL CHECK FOR PUBLIC STREAM
router.get('/stream', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      where: { 
        conversation: { 
          institution_id: { equals: null } // 🛡️ Using 'equals: null' forces Prisma to ignore everything with an ID
        }, 
        is_human: true 
      },
      orderBy: { created_at: 'desc' },
      take: 50
    });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: "Mission Archive currently offline." });
  }
});

export default router;
