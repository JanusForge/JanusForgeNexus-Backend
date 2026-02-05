import express from 'express';
import { prisma } from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

// 🚀 EXACT REPLICATION: Shuffler from nodes.ts
function shuffleCouncil(array: AIParticipant[]) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 🏛️ PUBLIC ARCHIVE: Isolated via institution_id: null
router.get('/stream', async (req, res) => {
  try {
    const threads = await prisma.conversation.findMany({
      where: {
        is_public: true,
        institution_id: null,
      },
      include: {
        posts: {
          orderBy: { created_at: 'asc' }
        }
      },
      orderBy: { created_at: 'desc' },
      take: 50
    });
    
    // 🚀 THE UPDATE: Flatten ALL posts from these threads into a single array
    // This ensures clicking a title in the sidebar pulls the full history, not just the query.
    const allPosts = threads.flatMap(t => t.posts);
    res.json(allPosts);
  } catch (err) {
    res.status(500).json({ error: "Public Archive Fault" });
  }
});

// 🚀 PUBLIC IGNITION: Mirroring nodes.ts Fallbacks & Logic
router.post('/ignite', async (req: any, res) => {
  const { prompt, userId, conversationId } = req.body;
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Access Denied" });

    // 🛡️ SYSTEM DIRECTIVE: Professionalized for Public Nexus
    const systemDirective = `
      IDENTITY: Janus Forge Nexus Council Member.
      CONTEXT: Civilization-scale problem-solving discourse.
      RESPONSE: Respond to the users' query and the councils comments according to your foundational principles.
    `;

    let conversation;
    if (conversationId && !conversationId.startsWith('nexus-temp')) {
      conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: true, // 🛡️ Siloed as Public
          is_private: false,
          institution_id: null, // 🛡️ Siloed from Institutions
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

    res.json({ success: true, conversationId: conversation.id });

    setImmediate(async () => {
      try {
        const models = [AIParticipant.CLAUDE, AIParticipant.GPT, AIParticipant.GEMINI, AIParticipant.GROK, AIParticipant.DEEPSEEK];
        const randomizedCouncil = shuffleCouncil(models);
        let currentSessionContext = "";

        for (const modelEnum of randomizedCouncil) {
          try {
            let aiContent = "";
            const isolatedPrompt = `${systemDirective}\n\nUSER QUERY: ${prompt}\n\nCOUNCIL DISCUSSION HISTORY:\n${currentSessionContext}\n\nRespond as ${modelEnum}:`;

            // --- 🤖 EXACT FALLBACK STRINGS FROM NODES.TS ---
            if (modelEnum === AIParticipant.GPT) {
              const fallbacks = ["gpt-4o", "gpt-4-turbo"];
              for (const m of fallbacks) {
                try {
                  const comp = await aiClients.GPT4.chat.completions.create({
                    model: m, messages: [{ role: "user", content: isolatedPrompt }],
                  });
                  aiContent = comp.choices[0].message.content || "";
                  if (aiContent) break;
                } catch (e) { console.warn(`GPT ${m} failed`); }
              }
            }
            else if (modelEnum === AIParticipant.GEMINI) {
              const fallbacks = ["gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-1.5-pro", "gemini-1.5-flash"];
              for (const m of fallbacks) {
                try {
                  const model = aiClients.GEMINI.getGenerativeModel({ model: m });
                  const result = await model.generateContent(isolatedPrompt);
                  aiContent = result.response.text();
                  if (aiContent) break;
                } catch (e) { console.warn(`Gemini ${m} failed`); }
              }
            }
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
                } catch (e) { console.warn(`Claude ${m} failed`); }
              }
            }
            else if (modelEnum === AIParticipant.GROK) {
              const fallbacks = ["grok-4.1-fast", "grok-4-fast", "grok-3-mini"];
              for (const m of fallbacks) {
                try {
                  const comp = await aiClients.GROK.chat.completions.create({
                    model: m, messages: [{ role: "user", content: isolatedPrompt }],
                  });
                  aiContent = comp.choices[0]?.message?.content || "";
                  if (aiContent) break;
                } catch (e) { console.warn(`Grok ${m} failed`); }
              }
            }
            else if (modelEnum === AIParticipant.DEEPSEEK) {
              try {
                const comp = await aiClients.DEEPSEEK.chat.completions.create({
                  model: "deepseek-chat", messages: [{ role: "user", content: isolatedPrompt }]
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
                  name: `Nexus_${modelEnum}`,
                  ai_model: modelEnum
                }
              });
              currentSessionContext += `--- ${modelEnum} PERSPECTIVE ---\n${aiContent}\n\n`;
              io.emit('nexus:transmission', aiPost);
              await new Promise(r => setTimeout(r, 1500));
            }
          } catch (err) {
            console.error(`Council Cycle Fault:`, err);
          }
        }
      } catch (innerError) {
        console.error("Background Loop Fault:", innerError);
      }
    });
  } catch (error) {
    console.error("🔥 PUBLIC IGNITE ERROR:", error);
    if (!res.headersSent) res.status(500).json({ error: "Public Ignite Failure" });
  }
});

export default router;
