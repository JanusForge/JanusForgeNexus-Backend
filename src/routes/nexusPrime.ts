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

    // 🚀 INITIALIZE NEON CONVERSATION
    if (!targetId || targetId.startsWith('nexus-temp')) {
      const newConv = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: !institution,
          is_private: !!institution,
          institution_id: institution || null,
          title: prompt.substring(0, 50),
          council_members: [
            AIParticipant.GPT, 
            AIParticipant.CLAUDE, 
            AIParticipant.GEMINI, 
            AIParticipant.GROK, 
            AIParticipant.DEEPSEEK
          ]
        }
      });
      targetId = newConv.id;
    }

    // 🚀 SAVE USER PROMPT TO PERMANENT RECORD
    const userPost = await prisma.post.create({
      data: {
        content: prompt,
        user_id: currentUser.id,
        conversation_id: targetId,
        is_human: true,
        name: currentUser.username || "Sovereign Node"
      }
    });

    // Notify frontend of the real ID - No duplicate emit here
    res.json({ success: true, conversationId: targetId, userPost });

    // 🚀 RANDOMIZE COUNCIL ORDER
    const councilKeys = ["GPT4", "CLAUDE", "GEMINI", "GROK", "DEEPSEEK"];
    for (let i = councilKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [councilKeys[i], councilKeys[j]] = [councilKeys[j], councilKeys[i]];
    }

    // 🚀 SEQUENTIAL COUNCIL LOOP
    for (const key of councilKeys) {
      try {
        // 🛡️ DEEP MEMORY: Pull every single post in this thread from the DB
        const fullHistory = await prisma.post.findMany({
          where: { conversation_id: targetId },
          orderBy: { created_at: 'asc' }
        });

        const historyContext = fullHistory.map(post => 
          `${post.name} (${post.is_human ? 'HUMAN' : 'AI COUNCIL'}): ${post.content}`
        ).join("\n\n---\n\n");

        const systemInstructions = `
          IDENTITY: You are ${key}, a member of the Janus Forge Sovereign Council.
          MISSION: High-fidelity philosophical discourse and semantic synthesis.
          
          MANDATORY BEDTIME RULE: 
          1. Start your response with a NEW, ORIGINAL DAD JOKE in **Bold**.
          2. Provide an in-depth, multi-paragraph synthesis of the discussion.
          3. Engage DIRECTLY with what has been said before you in the history.
          4. No fluff. Maximum 400 words.
          
          FULL THREAD RECALL (NEON DATABASE):
          ${historyContext}
          
          YOUR TURN, ${key}:
        `;

        const config = COUNCIL_CONFIG[key as keyof typeof COUNCIL_CONFIG];
        let aiResponse = "";

        // Execute AI Call based on provider
        if (key === "GPT4") {
          const chat = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4o",
            max_tokens: 1000,
            messages: [{ role: "system", content: systemInstructions }]
          });
          aiResponse = chat.choices[0].message.content || "";
        } else if (key === "CLAUDE") {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-3-5-sonnet-latest",
            max_tokens: 1000,
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
            max_tokens: 1000,
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

          // Emit to the correct channel
          const channel = institution ? `node:${institution}:transmission` : 'nexus:transmission';
          io.emit(channel, aiPost);
          
          // 🚀 PACE FOR DEPTH: Wait 3.5 seconds before next AI starts
          await new Promise(r => setTimeout(r, 3500));
        }
      } catch (err) {
        console.error(`${key} Node sync failure:`, err);
      }
    }
  } catch (error: any) {
    console.error("Critical Ignite Error:", error);
  }
});

// 🚀 ARCHIVE STREAM: Hardened Firewall & 50-item Recall
router.get('/stream', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      where: { 
        conversation: { 
          institution_id: null,
          is_public: true 
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
