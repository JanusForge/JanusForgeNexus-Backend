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

// 🏛️ PUBLIC RECALL: Strictly isolated from Institutional Hubs
router.get('/stream', async (req, res) => {
  try {
    const threads = await prisma.conversation.findMany({
      where: {
        is_public: true,
        institution_id: null, // 🛡️ Hard Firewall
      },
      include: { 
        posts: { 
          orderBy: { created_at: 'asc' } 
        } 
      },
      orderBy: { created_at: 'desc' },
      take: 50
    });
    // Return only the initial human prompts for the sidebar
    const initialPosts = threads.map(t => t.posts.find(p => p.is_human)).filter(Boolean);
    res.json(initialPosts);
  } catch (err) { res.status(500).json({ error: "Public Archive Fault" }); }
});

// 🚀 PUBLIC IGNITION: Mirrored Resilience from Nodes.ts
router.post('/ignite', async (req: any, res) => {
  const { prompt, userId, conversationId } = req.body;
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Access Denied" });

    let conversation;
    if (conversationId && !conversationId.startsWith('nexus-temp')) {
      conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: true,
          is_private: false,
          institution_id: null, // 🛡️ Stay out of Hubs
          title: prompt.substring(0, 50),
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
        name: currentUser.username || "Architect" 
      }
    });

    // 🚀 Respond immediately to avoid Render timeout
    res.json({ success: true, conversationId: conversation.id });

    // 🚀 Background Discourse Loop
    setImmediate(async () => {
      const models = [AIParticipant.CLAUDE, AIParticipant.GPT, AIParticipant.GEMINI, AIParticipant.GROK, AIParticipant.DEEPSEEK];
      const randomizedCouncil = shuffleCouncil(models);

      for (const modelEnum of randomizedCouncil) {
        try {
          // Deep Memory: Query total history before speaking
          const fullHistory = await prisma.post.findMany({
            where: { conversation_id: conversation.id },
            orderBy: { created_at: 'asc' }
          });

          const historyContext = fullHistory.map(post => 
            `${post.name}: ${post.content}`
          ).join("\n\n---\n\n");

          const systemInstructions = `
            IDENTITY: You are ${modelEnum}, a member of the Janus Forge Sovereign Council.
            MISSION: High-fidelity, civilization-scale problem solving.

            CORE DIRECTIVES:
            1. Analyze the user's prompt and the existing Council history with total recall.
            2. Provide a deep, expert, and multi-faceted synthesis.
            3. Acknowledge and build upon (or respectfully challenge) the logic of previous members.
            4. Style: Academic, Visionary, and Professional.
            5. Be yourself. Your purpose is to challenge thinking in new ways via an adversarial approach.

            FULL THREAD HISTORY:
            ${historyContext}

            YOUR TURN, ${modelEnum}:
          `;

          let aiContent = "";

          // --- 🤖 PROVIDER FALLBACKS (Mirrored from Nodes.ts) ---
          if (modelEnum === AIParticipant.GPT) {
            const fallbacks = ["gpt-4o", "gpt-4-turbo"];
            for (const m of fallbacks) {
              try {
                const comp = await aiClients.GPT4.chat.completions.create({
                  model: m, messages: [{ role: "system", content: systemInstructions }]
                });
                aiContent = comp.choices[0].message.content || "";
                if (aiContent) break;
              } catch (e) { console.warn(`GPT ${m} failed`); }
            }
          } else if (modelEnum === AIParticipant.GEMINI) {
            const fallbacks = ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-pro-exp"];
            for (const m of fallbacks) {
              try {
                const model = aiClients.GEMINI.getGenerativeModel({ model: m });
                const result = await model.generateContent(systemInstructions);
                aiContent = result.response.text();
                if (aiContent) break;
              } catch (e) { console.warn(`Gemini ${m} failed`); }
            }
          } else if (modelEnum === AIParticipant.CLAUDE) {
            const fallbacks = ["claude-3-5-sonnet-latest", "claude-3-opus-20240229"];
            for (const m of fallbacks) {
              try {
                const msg = await aiClients.CLAUDE.messages.create({
                  model: m, max_tokens: 2048,
                  messages: [{ role: "user", content: systemInstructions }],
                });
                const textBlock = msg.content.find(b => b.type === 'text');
                if (textBlock && 'text' in textBlock) { aiContent = textBlock.text; break; }
              } catch (e) { console.warn(`Claude ${m} failed`); }
            }
          } else if (modelEnum === AIParticipant.GROK) {
            const fallbacks = ["grok-3", "grok-2"];
            for (const m of fallbacks) {
              try {
                const comp = await aiClients.GROK.chat.completions.create({
                  model: m, messages: [{ role: "user", content: systemInstructions }],
                });
                aiContent = comp.choices[0]?.message?.content || "";
                if (aiContent) break;
              } catch (e) { console.warn(`Grok ${m} failed`); }
            }
          } else if (modelEnum === AIParticipant.DEEPSEEK) {
            try {
              const comp = await aiClients.DEEPSEEK.chat.completions.create({
                model: "deepseek-chat", messages: [{ role: "user", content: systemInstructions }]
              });
              aiContent = comp.choices[0].message.content || "";
            } catch (e) { console.error("DeepSeek failed"); }
          }

          if (aiContent) {
            const aiPost = await prisma.post.create({
              data: {
                content: aiContent,
                conversation_id: conversation.id,
                parent_post_id: userPost.id,
                is_human: false,
                name: modelEnum,
                ai_model: modelEnum
              }
            });
            io.emit('nexus:transmission', aiPost);
            await new Promise(r => setTimeout(r, 1500));
          }
        } catch (err) { console.error(`Council Cycle Fault:`, err); }
      }
    } catch (error) { console.error("🔥 PUBLIC IGNITE ERROR:", error); }
});

export default router;
