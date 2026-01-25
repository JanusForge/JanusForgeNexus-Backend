import express from 'express';
import { prisma } from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

// 🧬 DNA REPLICATION: Exact shuffle logic from Nexus Prime
function shuffleCouncil(array: AIParticipant[]) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 🏛️ NODE HISTORY (Private & Architect Override)
router.get('/history', async (req, res) => {
  const { institution, userType, userId } = req.query;
  try {
    const requestingUser = await prisma.user.findUnique({ where: { id: String(userId) } });
    const isArchitect = requestingUser?.username === 'CassandraWilliamson' || (requestingUser?.role as string) === 'GOD_MODE';

    const threads = await prisma.conversation.findMany({
      where: {
        is_public: false,
        title: { startsWith: `[${institution}-${userType}]` },
        ...(isArchitect ? {} : { user_id: String(userId) })
      },
      include: { posts: { orderBy: { created_at: 'asc' } } },
      orderBy: { created_at: 'desc' }
    });
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: "Archive Retrieval Fault" });
  }
});

// 🚀 NODE IGNITION (Powered by Nexus Prime Engine)
router.post('/ignite', async (req: any, res) => {
  const { prompt, institution, userType, userId, conversationId } = req.body;
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Node credentials invalid." });

    const systemDirective = `### IDENTITY: Sovereign AI Council for ${institution}. ### CONTEXT: ${userType} access point. ### MISSION: Provide high-fidelity, adversarial feedback.`;

    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: false,
          title: `[${institution}-${userType}] ${prompt.substring(0, 30)}...`,
          council_members: [AIParticipant.CLAUDE, AIParticipant.GPT, AIParticipant.GEMINI, AIParticipant.GROK, AIParticipant.DEEPSEEK]
        }
      });
    }

    const userPost = await prisma.post.create({
      data: {
        content: prompt,
        user_id: currentUser.id,
        conversation_id: conversation.id,
        is_human: true,
        name: currentUser.username || "Sovereign User"
      }
    });

    io.emit(`node:${institution}:transmission`, userPost);
    res.json({ success: true, conversationId: conversation.id });

    // --- START NEXUS PRIME ENGINE REPLICATION ---
    const models = [AIParticipant.CLAUDE, AIParticipant.GPT, AIParticipant.GEMINI, AIParticipant.GROK, AIParticipant.DEEPSEEK];
    const randomizedCouncil = shuffleCouncil(models);
    let currentSessionContext = "";

    for (const modelEnum of randomizedCouncil) {
      try {
        let aiContent = "";
        const isolatedPrompt = `${systemDirective}\n\n### QUERY: ${prompt}\n\n### DISCUSSION:\n${currentSessionContext}\n\nIdentity: ${modelEnum}.`;

        if (modelEnum === AIParticipant.GPT) {
          const comp = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4o", messages: [{ role: "user", content: isolatedPrompt }],
          });
          aiContent = comp.choices[0].message.content || "";
        } 
        else if (modelEnum === AIParticipant.GEMINI) {
          const model = aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" });
          const result = await model.generateContent(isolatedPrompt);
          aiContent = result.response.text();
        }
        else if (modelEnum === AIParticipant.CLAUDE) {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-3-5-sonnet-latest", max_tokens: 1024,
            messages: [{ role: "user", content: isolatedPrompt }],
          });
          const textBlock = msg.content.find(b => b.type === 'text');
          if (textBlock && 'text' in textBlock) aiContent = textBlock.text;
        }
        else if (modelEnum === AIParticipant.GROK) {
          const comp = await aiClients.GROK.chat.completions.create({
            model: "grok-4.1-fast", // RESTORED: 2026 terminal version
            messages: [{ role: "user", content: isolatedPrompt }],
          });
          aiContent = comp.choices[0]?.message?.content || "";
        }
        else if (modelEnum === AIParticipant.DEEPSEEK) {
          const comp = await aiClients.DEEPSEEK.chat.completions.create({
            model: "deepseek-chat", messages: [{ role: "user", content: isolatedPrompt }]
          });
          aiContent = comp.choices[0].message.content || "";
        }

        if (aiContent) {
          const aiPost = await prisma.post.create({
            data: {
              content: aiContent,
              conversation_id: conversation.id,
              parent_post_id: userPost.id,
              is_human: false,
              name: `${institution}_${modelEnum}`,
              ai_model: modelEnum
            }
          });
          currentSessionContext += `${modelEnum}: ${aiContent}\n\n`;
          io.emit(`node:${institution}:transmission`, aiPost);
          await new Promise(r => setTimeout(r, 1200)); // Standard cooling delay
        }
      } catch (err) { console.error(`Node Council Error:`, err); }
    }
  } catch (error) {
    console.error("🔥 NODE IGNITION FAULT:", error);
    if (!res.headersSent) res.status(500).json({ error: "Node Sync Error" });
  }
});

export default router;
