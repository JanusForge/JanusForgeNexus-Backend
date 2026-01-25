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
    // 🏛️ 1. IDENTITY LOOKUP (Doing it right)
    const currentUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    const activeName = currentUser?.username || "Sovereign Node";

    // 🚦 2. COOLDOWN CHECK
    const lastPost = await prisma.post.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });

    if (lastPost && (Date.now() - new Date(lastPost.created_at).getTime() < 30000)) {
      return res.status(429).json({ error: "The Forge is cooling down. Wait 30 seconds." });
    }

    let targetConversationId = conversationId;

    // 🏛️ 3. CONVERSATION ANCHORING
    if (!targetConversationId) {
      const newConversation = await prisma.conversation.create({
        data: {
          user_id: userId,
          is_public: true,
          title: prompt.substring(0, 50),
          council_members: models.map((m: string) => m as any)
        }
      });
      targetConversationId = newConversation.id;
    }

    // 🏛️ 4. THREAD-LOCKED ANCESTRY
    let threadAncestry = "";
    if (targetConversationId) {
      const history = await prisma.post.findMany({
        where: { conversation_id: targetConversationId },
        orderBy: { created_at: 'asc' },
        take: 10 
      });
      threadAncestry = history.map(p => `${p.is_human ? 'USER' : p.name}: ${p.content}`).join("\n\n");
    }

    // 🏛️ 5. CREATE USER POST (Identity Verified)
    const userPost = await prisma.post.create({
      data: {
        content: prompt,
        user_id: userId || null,
        conversation_id: targetConversationId,
        parent_post_id: parentPostId || null,
        is_human: true,
        name: activeName 
      }
    });

    io.emit('nexus:transmission', userPost);
    if (!parentPostId) io.emit('nexus:new_root', userPost);
    res.json({ success: true, conversationId: targetConversationId });

    // 🚀 6. SEQUENTIAL ACTIVATION
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

    const randomizedCouncil = shuffleCouncil(validCouncilMembers);
    let currentSessionContext = "";

    for (const modelEnum of randomizedCouncil) {
      try {
        let aiContent = "";
        const isolatedPrompt = `
### CURRENT USER QUERY:
"${prompt}"

### THREAD HISTORY (CONTEXT FOR THIS CONVERSATION ONLY):
${threadAncestry}

### RECENT COUNCIL DISCUSSION:
${currentSessionContext}

### YOUR IDENTITY: You are ${modelEnum}.
### MISSION: Respond to the user's current query using the history of THIS thread. Be concise and actionable.
### YOUR RESPONSE:`;

        if (modelEnum === AIParticipant.GPT) {
          const fallbacks = ["gpt-5.2", "gpt-5-2-extended", "gpt-4o"];
          for (const m of fallbacks) {
            try {
              const comp = await aiClients.GPT4.chat.completions.create({
                model: m, messages: [{ role: "user", content: isolatedPrompt }],
              });
              aiContent = comp.choices[0].message.content || "";
              if (aiContent) break;
            } catch (e) { console.warn(`GPT [${m}] failed.`); }
          }
        }
        else if (modelEnum === AIParticipant.GEMINI) {
          const fallbacks = ["gemini-3-pro", "gemini-3-flash", "gemini-1.5-pro"];
          for (const m of fallbacks) {
            try {
              const model = aiClients.GEMINI.getGenerativeModel({ model: m });
              const result = await model.generateContent(isolatedPrompt);
              aiContent = result.response.text();
              if (aiContent) break;
            } catch (e) { console.warn(`Gemini [${m}] failed.`); }
          }
        }
        else if (modelEnum === AIParticipant.CLAUDE) {
          const fallbacks = ["claude-3-5-sonnet-20241022", "claude-3-5-sonnet-latest"];
          for (const m of fallbacks) {
            try {
              const msg = await aiClients.CLAUDE.messages.create({
                model: m,
                max_tokens: 1024,
                messages: [{ role: "user", content: isolatedPrompt }],
              });

              const textBlock = msg.content.find(block => block.type === 'text');
              if (textBlock && 'text' in textBlock) {
                aiContent = textBlock.text;
                break;
              }
            } catch (e) { console.warn(`Claude [${m}] failed.`); }
          }
        }
        else if (modelEnum === AIParticipant.GROK) {
          const comp = await aiClients.GROK.chat.completions.create({
            model: "grok-2-latest", messages: [{ role: "user", content: isolatedPrompt }]
          });
          aiContent = comp.choices[0].message.content || "";
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
              conversation_id: targetConversationId,
              parent_post_id: userPost.id,
              is_human: false,
              name: modelEnum.toString(),
              ai_model: modelEnum
            }
          });
          currentSessionContext += `${modelEnum}: ${aiContent}\n\n`;
          io.emit('nexus:transmission', aiPost);
          await new Promise(r => setTimeout(r, 600));
        }
      } catch (err) { console.error(`Council Failure:`, err); }
    }
  } catch (error: any) {
    if (!res.headersSent) res.status(500).json({ error: "Sync Error" });
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
