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
  const { prompt, userId, conversationId } = req.body; // No 'institution' accepted here
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    let targetId = conversationId;

    // 🛡️ HARD FIREWALL: Forced 'null' for institution_id to keep it in the Public Silo
    if (!targetId || targetId.startsWith('nexus-temp')) {
      const newConv = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: true,
          is_private: false,
          institution_id: null, // STRICTLY NULL
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
        name: currentUser.username || "Public Node"
      }
    });

    // Respond immediately to prevent Render timeouts
    res.json({ success: true, conversationId: targetId, userPost });

    // 🚀 START THE COUNCIL (Dedicated Public Background Loop)
    setImmediate(async () => {
      const councilKeys = ["GPT4", "CLAUDE", "GEMINI", "GROK", "DEEPSEEK"];
      
      // Randomization Logic (Matches your working Hub logic)
      for (let i = councilKeys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [councilKeys[i], councilKeys[j]] = [councilKeys[j], councilKeys[i]];
      }

      for (const key of councilKeys) {
        try {
          // Deep Recall
          const fullHistory = await prisma.post.findMany({
            where: { conversation_id: targetId },
            orderBy: { created_at: 'asc' }
          });

          const historyContext = fullHistory.map(post => `${post.name}: ${post.content}`).join("\n\n---\n\n");

          const systemInstructions = `
           IDENTITY: You are ${key}, a member of the Janus Forge Sovereign Council.
           MISSION: High-fidelity, civilization-scale problem solving.
  
           CORE DIRECTIVES:
           1. Analyze the user's prompt and the existing Council history with total recall.
           2. Provide a deep, expert, and multi-faceted synthesis. 
           3. Acknowledge and build upon (or respectfully challenge) the logic of previous members.
           4. Style: Academic, Visionary, and Professional. 
           5. Be yourself. Your purpose is to challenge thinking in new ways via an adversarial collaborative methodology.
  
           FULL THREAD HISTORY:
           ${historyContext}
  
           YOUR TURN, ${key}:
          `;          

          const config = COUNCIL_CONFIG[key as keyof typeof COUNCIL_CONFIG];
          let aiResponse = "";

          // Fallback logic for each model (identical to your working Hub method)
          if (key === "GPT4") {
            const chat = await aiClients.GPT4.chat.completions.create({ model: "gpt-4o", max_tokens: 1200, messages: [{ role: "system", content: systemInstructions }] });
            aiResponse = chat.choices[0].message.content || "";
          } else if (key === "CLAUDE") {
            const msg = await aiClients.CLAUDE.messages.create({ model: "claude-3-5-sonnet-latest", max_tokens: 1200, messages: [{ role: "user", content: systemInstructions }] });
            aiResponse = msg.content[0].type === 'text' ? msg.content[0].text : "";
          } else if (key === "GEMINI") {
            const result = await aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" }).generateContent(systemInstructions);
            aiResponse = result.response.text();
          } else if (key === "GROK") {
            const chat = await aiClients.GROK.chat.completions.create({ model: "grok-beta", messages: [{ role: "user", content: systemInstructions }] });
            aiResponse = chat.choices[0].message.content || "";
          } else if (key === "DEEPSEEK") {
            const chat = await aiClients.DEEPSEEK.chat.completions.create({ model: "deepseek-chat", max_tokens: 1200, messages: [{ role: "user", content: systemInstructions }] });
            aiResponse = chat.choices[0].message.content || "";
          }

          if (aiResponse) {
            await prisma.post.create({
              data: {
                content: aiResponse,
                conversation_id: targetId,
                parent_post_id: userPost.id,
                is_human: false,
                name: key,
                ai_model: config.enum
              }
            });
            // Public channel only
            io.emit('nexus:transmission', { ...userPost, content: aiResponse, name: key, is_human: false, id: Date.now().toString() });
            await new Promise(r => setTimeout(r, 2500)); 
          }
        } catch (err) { console.error(`${key} public failure:`, err); }
      }
    });

  } catch (error: any) { console.error("Public Ignite Error:", error); }
});

// 🚀 RECALL: Strictly Public only
router.get('/stream', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      where: { 
        conversation: { institution_id: { equals: null } },
        is_human: true 
      },
      orderBy: { created_at: 'desc' },
      take: 50
    });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: "Public archive offline." }); }
});

export default router;
