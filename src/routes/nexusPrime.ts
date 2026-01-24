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

router.post('/ignite', async (req: any, res) => {
  const { prompt, models, userId, conversationId, parentPostId } = req.body;
  const io = req.app.get('socketio');

  try {
    // 🚦 1. COOLDOWN & PERSISTENCE CHECK
    const lastPost = await prisma.post.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });

    if (lastPost && (Date.now() - new Date(lastPost.created_at).getTime() < 30000)) {
      return res.status(429).json({ error: "The Forge is cooling down. Wait 30 seconds." });
    }

    // 🏛️ 2. ANCESTRY RECALL (The "Thread Memory" Engine)
    let threadAncestry = "";
    if (parentPostId || conversationId) {
      const history = await prisma.post.findMany({
        where: { conversation_id: conversationId },
        orderBy: { created_at: 'asc' },
        take: 15 // Last 15 turns for context depth
      });
      threadAncestry = history.map(p => `${p.is_human ? 'USER' : p.name}: ${p.content}`).join("\n\n");
    }

    let targetConversationId = conversationId;

    const modelMap: Record<string, AIParticipant> = {
      'CLAUDE': AIParticipant.CLAUDE,
      'GPT4': AIParticipant.GPT,
      'GEMINI': AIParticipant.GEMINI,
      'GROK': AIParticipant.GROK,
      'DEEPSEEK': AIParticipant.DEEPSEEK
    };

    const validCouncilMembers = models
      .map((m: string) => modelMap[m])
      .filter((m: any) => m !== undefined);

    if (!targetConversationId) {
      const newConversation = await prisma.conversation.create({
        data: {
          user_id: userId,
          is_public: true,
          title: prompt.substring(0, 50),
          council_members: validCouncilMembers
        }
      });
      targetConversationId = newConversation.id;
    }

    const userPost = await prisma.post.create({
      data: {
        content: prompt,
        user_id: userId,
        conversation_id: targetConversationId,
        parent_post_id: parentPostId || null,
        is_human: true,
        name: "Sovereign Node"
      }
    });

    io.emit('nexus:transmission', userPost);
    if (!parentPostId) io.emit('nexus:new_root', userPost);
    res.json({ success: true, conversationId: targetConversationId });

    // 🚀 3. SEQUENTIAL ACTIVATION WITH MEMORY & ROLLING CONTEXT
    const randomizedCouncil = shuffleCouncil(validCouncilMembers);
    let currentSessionContext = "";

    for (const modelEnum of randomizedCouncil) {
      try {
        let aiContent = "";
        
        // Build the full prompt including Ancestry (Memory) and current Session context
        const isolatedPrompt = `
### THREAD ANCESTRY (HISTORY):
${threadAncestry}

### CURRENT COUNCIL SESSION:
${currentSessionContext}

### YOUR IDENTITY: You are ${modelEnum}.
### MISSION: Analyze the history and the current session's points. Provide your synthesis.
### YOUR RESPONSE:`;

        // --- CLAUDE (Anthropic) ---
        if (modelEnum === AIParticipant.CLAUDE) {
          const fallbacks = ["claude-3-5-sonnet-20241022", "claude-3-opus-latest"];
          for (const m of fallbacks) {
            try {
              const msg = await aiClients.CLAUDE.messages.create({
                model: m, max_tokens: 1024, messages: [{ role: "user", content: isolatedPrompt }],
              });
              aiContent = msg.content[0].text;
              if (aiContent) break;
            } catch (e) { console.warn(`Claude fallback ${m} failed`); }
          }
        }
        // --- GPT-5 (OpenAI January 2026 Edition) ---
        else if (modelEnum === AIParticipant.GPT) {
          const fallbacks = ["gpt-5.2", "gpt-5-2-extended", "gpt-5.1-chat-latest"];
          for (const m of fallbacks) {
            try {
              const comp = await aiClients.GPT4.chat.completions.create({
                model: m, messages: [{ role: "user", content: isolatedPrompt }],
              });
              aiContent = comp.choices[0].message.content || "";
              if (aiContent) break;
            } catch (e) { console.warn(`GPT fallback ${m} failed`); }
          }
        }
        // --- GEMINI 3 (Google January 2026 Edition) ---
        else if (modelEnum === AIParticipant.GEMINI) {
          const fallbacks = ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-3-pro"];
          for (const m of fallbacks) {
            try {
              const model = aiClients.GEMINI.getGenerativeModel({ model: m });
              const result = await model.generateContent(isolatedPrompt);
              aiContent = result.response.text();
              if (aiContent) break;
            } catch (e) { console.warn(`Gemini fallback ${m} failed`); }
          }
        }
        // --- GROK (xAI) ---
        else if (modelEnum === AIParticipant.GROK) {
          const fallbacks = ["grok-4.1", "grok-2-latest", "grok-3"];
          for (const m of fallbacks) {
            try {
              const comp = await aiClients.GROK.chat.completions.create({
                model: m, messages: [{ role: "user", content: isolatedPrompt }]
              });
              aiContent = comp.choices[0].message.content || "";
              if (aiContent) break;
            } catch (e) { console.warn(`Grok fallback ${m} failed`); }
          }
        }
        // --- DEEPSEEK ---
        else if (modelEnum === AIParticipant.DEEPSEEK) {
          const fallbacks = ["deepseek-chat", "deepseek-reasoner"];
          for (const m of fallbacks) {
            try {
              const comp = await aiClients.DEEPSEEK.chat.completions.create({
                model: m, messages: [{ role: "user", content: isolatedPrompt }]
              });
              aiContent = comp.choices[0].message.content || "";
              if (aiContent) break;
            } catch (e) { console.warn(`DeepSeek fallback ${m} failed`); }
          }
        }

        if (aiContent) {
          const aiPost = await prisma.post.create({
            data: {
              content: aiContent,
              conversation_id: targetConversationId,
              parent_post_id: userPost.id,
              is_human: false,
              name: modelEnum.toString(),
              ai_model: modelEnum
            }
          });
          // Update session context for the next model in the loop
          currentSessionContext += `${modelEnum}: ${aiContent}\n\n`;
          io.emit('nexus:transmission', aiPost);
          await new Promise(r => setTimeout(r, 600));
        }
      } catch (err) { console.error(`Council Failure:`, err); }
    }
  } catch (error: any) {
    if (!res.headersSent) res.status(500).json({ error: "Sync Error", details: error.message });
  }
});

router.get('/stream', async (req, res) => {
  try {
    const feed = await prisma.conversation.findMany({
      where: { is_public: true },
      include: { posts: { orderBy: { created_at: 'asc' }, include: { user: { select: { is_founder: true } } } } },
      orderBy: { created_at: 'desc' }
    });
    res.json(feed.flatMap(f => f.posts));
  } catch (err) { res.status(500).json({ error: "Stream Error" }); }
});

export default router;
