import express from 'express';
import { prisma } from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

function shuffleCouncil(array: AIParticipant[]) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 🏛️ NODE HISTORY (Architect & Role Isolated)
router.get('/history', async (req, res) => {
  const { institution, userType, userId } = req.query;
  try {
    const user = await prisma.user.findUnique({ where: { id: String(userId) } });
    const isArchitect = user?.username === 'CassandraWilliamson' || (user?.role as string) === 'GOD_MODE';
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
  } catch (err) { res.status(500).json({ error: "Archive Retrieval Fault" }); }
});

// 🚀 NODE IGNITION (High-Resilience Nexus Prime Engine)
router.post('/ignite', async (req: any, res) => {
  const { prompt, institution, userType, userId, conversationId } = req.body;
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Access Denied" });

    const systemDirective = `
      IDENTITY: Sovereign AI Council Member for ${institution}. 
      CONTEXT: This is a ${userType} research session.
      FORMATTING: Use "###" for Section Headers. Use double-spacing between paragraphs.
      STRUCTURE: 1. Executive Summary, 2. Analysis, 3. Adversarial Peer Review, 4. Regional Impact, 5. Conclusion.
    `;

    let conversation;
    if (conversationId) conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
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
      data: { content: prompt, user_id: currentUser.id, conversation_id: conversation.id, is_human: true, name: currentUser.username || "Architect" }
    });

    io.emit(`node:${institution}:transmission`, userPost);
    res.json({ success: true, conversationId: conversation.id });

    const models = [AIParticipant.CLAUDE, AIParticipant.GPT, AIParticipant.GEMINI, AIParticipant.GROK, AIParticipant.DEEPSEEK];
    const randomizedCouncil = shuffleCouncil(models);
    let currentSessionContext = "";

    for (const modelEnum of randomizedCouncil) {
      try {
        let aiContent = "";
        const isolatedPrompt = `${systemDirective}\n\nUSER QUERY: ${prompt}\n\nCOUNCIL DISCUSSION HISTORY:\n${currentSessionContext}\n\nRespond as ${modelEnum}:`;

        // --- 🤖 GPT FALLBACKS ---
        if (modelEnum === AIParticipant.GPT) {
          const fallbacks = ["gpt-4o", "gpt-4-turbo"];
          for (const m of fallbacks) {
            try {
              const comp = await aiClients.GPT4.chat.completions.create({
                model: m, messages: [{ role: "user", content: isolatedPrompt }],
              });
              aiContent = comp.choices[0].message.content || "";
              if (aiContent) break;
            } catch (e) { console.warn(`GPT ${m} failed in Node`); }
          }
        }
        // --- 🤖 GEMINI FALLBACKS (2026 Engine) ---
        else if (modelEnum === AIParticipant.GEMINI) {
          const fallbacks = ["gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-1.5-pro", "gemini-1.5-flash"];
          for (const m of fallbacks) {
            try {
              const model = aiClients.GEMINI.getGenerativeModel({ model: m });
              const result = await model.generateContent(isolatedPrompt);
              aiContent = result.response.text();
              if (aiContent) break;
            } catch (e) { console.warn(`Gemini ${m} failed in Node`); }
          }
        }
        // --- 🤖 CLAUDE FALLBACKS ---
        else if (modelEnum === AIParticipant.CLAUDE) {
          const fallbacks = ["claude-3-5-sonnet-latest", "claude-3-haiku-20240307", "claude-3-opus-20240229"];
          for (const m of fallbacks) {
            try {
              const msg = await aiClients.CLAUDE.messages.create({
                model: m, max_tokens: 2048,
                messages: [{ role: "user", content: isolatedPrompt }],
              });
              const textBlock = msg.content.find(b => b.type === 'text');
              if (textBlock && 'text' in textBlock) { aiContent = textBlock.text; break; }
            } catch (e) { console.warn(`Claude ${m} failed in Node`); }
          }
        }
        // --- 🤖 GROK FALLBACKS (2026 Resilient) ---
        else if (modelEnum === AIParticipant.GROK) {
          const fallbacks = ["grok-4.1-fast", "grok-4-fast", "grok-3-mini"];
          for (const m of fallbacks) {
            try {
              const comp = await aiClients.GROK.chat.completions.create({
                model: m, messages: [{ role: "user", content: isolatedPrompt }],
              });
              aiContent = comp.choices[0]?.message?.content || "";
              if (aiContent) break;
            } catch (e) { console.warn(`Grok ${m} failed in Node`); }
          }
        }
        // --- 🤖 DEEPSEEK ---
        else if (modelEnum === AIParticipant.DEEPSEEK) {
          try {
            const comp = await aiClients.DEEPSEEK.chat.completions.create({
              model: "deepseek-chat", messages: [{ role: "user", content: isolatedPrompt }]
            });
            aiContent = comp.choices[0].message.content || "";
          } catch (e) { console.error("DeepSeek failed in Node"); }
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
          currentSessionContext += `--- ${modelEnum} PERSPECTIVE ---\n${aiContent}\n\n`;
          io.emit(`node:${institution}:transmission`, aiPost);
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (err) { console.error(`Council Cycle Fault:`, err); }
    }
  } catch (error) {
    console.error("🔥 NODE SYNC ERROR:", error);
    if (!res.headersSent) res.status(500).json({ error: "Node Engine Failure" });
  }
});

export default router;
