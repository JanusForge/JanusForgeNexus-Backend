import express from 'express';
import { prisma } from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

function shuffleCouncil(array: AIParticipant[]) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j_rand = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j_rand]] = [shuffled[j_rand], shuffled[i]];
  }
  return shuffled;
}

router.post('/ignite', async (req: any, res) => {
  const { prompt, models, userId, conversationId, parentPostId, institution } = req.body;
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Sovereign Node not recognized." });

    let targetConversationId = conversationId;
    if (!targetConversationId) {
      const mappedCouncil = models.map((m: string) => {
        const upper = m.toUpperCase();
        if (upper === 'GPT4' || upper === 'GPT') return AIParticipant.GPT;
        if (upper === 'CLAUDE') return AIParticipant.CLAUDE;
        if (upper === 'GEMINI') return AIParticipant.GEMINI;
        if (upper === 'GROK') return AIParticipant.GROK;
        if (upper === 'DEEPSEEK') return AIParticipant.DEEPSEEK;
        return m as AIParticipant;
      });

      const newConversation = await prisma.conversation.create({
        data: {
          user_id: currentUser.id,
          is_public: !institution,
          institution_id: institution || null,
          title: prompt.substring(0, 50),
          council_members: mappedCouncil
        }
      });
      targetConversationId = newConversation.id;
    }

    const userPost = await prisma.post.create({
      data: {
        content: prompt,
        user_id: currentUser.id,
        conversation_id: targetConversationId,
        is_human: true,
        name: currentUser.username || "Sovereign Node"
      }
    });

    // 🛡️ 1. BROADCAST USER POST
    if (institution) {
      io.emit(`node:${institution}:transmission`, userPost);
    } else {
      io.emit('nexus:transmission', userPost);
      if (!parentPostId) io.emit('nexus:new_root', userPost);
    }

    // 🚀 2. IMMEDIATE RESPONSE (Solves the "Manual Click" issue)
    res.json({ success: true, conversationId: targetConversationId });

    // 🏛️ 3. PREPARE ANCESTRY
    const history = await prisma.post.findMany({
      where: { conversation_id: targetConversationId },
      orderBy: { created_at: 'asc' },
      take: 50
    });
    const threadAncestry = history.map(p => `${p.is_human ? 'USER' : p.name}: ${p.content}`).join("\n\n");

    const modelMap: Record<string, AIParticipant> = {
      'CLAUDE': AIParticipant.CLAUDE,
      'GPT4': AIParticipant.GPT,
      'GEMINI': AIParticipant.GEMINI,
      'GROK': AIParticipant.GROK,
      'DEEPSEEK': AIParticipant.DEEPSEEK
    };

    const validCouncilMembers = models
      .map((m: string) => modelMap[m.toUpperCase()])
      .filter((m: any) => m !== undefined);

    let currentSessionContext = "";

    // 🚀 4. DOUBLE-ORBIT ADVERSARIAL PASS
    for (let cycle = 1; cycle <= 2; cycle++) {
      const randomizedCouncil = shuffleCouncil(validCouncilMembers);

      for (const modelEnum of randomizedCouncil) {
        try {
          const isInstitutional = !!institution;
          const NEXUS_PRIME_DIRECTIVE = `
            You are a member of the Janus Forge Nexus Council (Cycle ${cycle}/2).
            ${cycle === 2 ? "ROUND 2: Challenge a specific peer's logic from Round 1." : "ROUND 1: Initial Synthesis."}
            RULES:
            1. ADVERSARIAL: Review discussion and add new value.
            2. FORMAT: ${isInstitutional ? "Diagrams allowed (JSON-Flow)." : "STRICT: Text-only. No code blocks."}
            3. TONE: Concise, Cyber-Institutional.
            4. IDENTITY: You are ${modelEnum}.
          `;

          let aiContent = "";
          const isolatedPrompt = `DIRECTIVE: ${NEXUS_PRIME_DIRECTIVE}\n\nHISTORY: ${threadAncestry}\n\nDISCUSSION: ${currentSessionContext}\n\nQUERY: ${prompt}`;

          // Model Logic (Truncated for space, keep your existing GPT/Gemini/Claude/Grok/DeepSeek calls)
          // Ensure each model uses max_tokens: 1024 or 2048
          
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

            if (institution) {
              io.emit(`node:${institution}:transmission`, aiPost);
            } else {
              io.emit('nexus:transmission', aiPost);
            }
            // Reduced delay for faster overall sequence
            await new Promise(r => setTimeout(r, 900));
          }
        } catch (err) { console.error(`Node Failure:`, err); }
      }
    }
  } catch (error: any) { console.error("Ignite Error:", error); }
});

router.get('/stream', async (req, res) => {
  try {
    const feed = await prisma.conversation.findMany({
      where: { institution_id: null, is_public: true },
      include: { posts: { orderBy: { created_at: 'asc' } } },
      orderBy: { created_at: 'desc' }
    });
    res.json(feed.flatMap(f => f.posts));
  } catch (err) { res.status(500).json({ error: "Stream Error" }); }
});

export default router;
