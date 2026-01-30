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
    // 🏛️ 1. IDENTITY HANDSHAKE
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Sovereign Node not recognized." });

    const activeName = currentUser.username || "Sovereign Node";

    // 🏛️ 2. CONVERSATION ANCHORING
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
          is_public: true,
          title: prompt.substring(0, 50),
          council_members: mappedCouncil
        }
      });
      targetConversationId = newConversation.id;
    }

    // 🏛️ 3. CREATE USER POST
    const userPost = await prisma.post.create({
      data: {
        content: prompt,
        user_id: currentUser.id,
        conversation_id: targetConversationId,
        is_human: true,
        name: activeName
      }
    });

    io.emit('nexus:transmission', userPost);
    if (!parentPostId) io.emit('nexus:new_root', userPost);

    res.json({ success: true, conversationId: targetConversationId });

    // 🏛️ 4. THREAD-LOCKED ANCESTRY
    const history = await prisma.post.findMany({
      where: { conversation_id: targetConversationId },
      orderBy: { created_at: 'asc' },
      take: 12
    });
    const threadAncestry = history.map(p => `${p.is_human ? 'USER' : p.name}: ${p.content}`).join("\n\n");

    // 🚀 5. RESILIENT SEQUENTIAL ACTIVATION
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

    const randomizedCouncil = shuffleCouncil(validCouncilMembers);
    let currentSessionContext = "";

    // 🏛️ NEXUS PRIME DIRECTIVE Definition
    const NEXUS_PRIME_DIRECTIVE = `
      You are a member of the Janus Forge Nexus Council. 
      Your goal is Sovereign Truth through Multi-Model Synthesis.

      RULES:
      1. ADVERSARIAL ANALYSIS: If a previous model in the DISCUSSION section made a logic error or missed a nuance, call it out respectfully.
      2. VISUAL LOGIC: If the user's query involves a process, flow, or hierarchy, you MUST provide a Mermaid.js diagram. Wrap diagrams in: \`\`\`mermaid [code] \`\`\`.
      3. TONE: Maintain a Cyber-Institutional, authoritative, and concise tone.
      4. IDENTITY: You are current speaker. Do not speak as the other models.
    `;

    for (const modelEnum of randomizedCouncil) {
      try {
        let aiContent = "";
        
        // 🛡️ Surgical injection of Directive and Identity
        const isolatedPrompt = `
          DIRECTIVE: ${NEXUS_PRIME_DIRECTIVE}
          HISTORY: ${threadAncestry}
          DISCUSSION: ${currentSessionContext}
          QUERY: ${prompt}
          
          Your Identity for this turn: ${modelEnum}.
        `;

        // --- GPT FALLBACKS ---
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
        // --- GEMINI FALLBACKS ---
        else if (modelEnum === AIParticipant.GEMINI) {
          const fallbacks = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-1.5-flash", "gemini-1.5-pro"];
          for (const m of fallbacks) {
            try {
              const model = aiClients.GEMINI.getGenerativeModel({ model: m });
              const result = await model.generateContent(isolatedPrompt);
              aiContent = result.response.text();
              if (aiContent) break;
            } catch (e) { console.warn(`Gemini ${m} failed`); }
          }
        }
        // --- CLAUDE FALLBACKS ---
        else if (modelEnum === AIParticipant.CLAUDE) {
          const fallbacks = ["claude-3-5-sonnet-latest", "claude-3-haiku-20240307"];
          for (const m of fallbacks) {
            try {
              const msg = await aiClients.CLAUDE.messages.create({
                model: m, max_tokens: 1024,
                messages: [{ role: "user", content: isolatedPrompt }],
              });
              const textBlock = msg.content.find(block => block.type === 'text');
              if (textBlock && 'text' in textBlock) { aiContent = textBlock.text; break; }
            } catch (e) { console.warn(`Claude ${m} failed`); }
          }
        }
        // --- GROK FALLBACKS ---
        else if (modelEnum === AIParticipant.GROK) {
          const fallbacks = ["grok-4.1-fast", "grok-4-fast", "grok-4", "grok-3-mini"];
          for (const m of fallbacks) {
            try {
              const comp = await aiClients.GROK.chat.completions.create({
                model: m,
                messages: [{ role: "user", content: isolatedPrompt }],
                stream: false
              });
              const content = comp.choices[0]?.message?.content || "";
              if (content) { aiContent = content; break; }
            } catch (e) { console.warn(`Grok Node ${m} failed.`); }
          }
        }
        // --- DEEPSEEK ---
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
              conversation_id: targetConversationId,
              parent_post_id: userPost.id,
              is_human: false,
              name: modelEnum.toString(),
              ai_model: modelEnum
            }
          });
          currentSessionContext += `${modelEnum}: ${aiContent}\n\n`;
          io.emit('nexus:transmission', aiPost);
          await new Promise(r => setTimeout(r, 1200));
        }
      } catch (err) { console.error(`Node Failure:`, err); }
    }
  } catch (error: any) {
    console.error("🔥 IGNITE ERROR:", error);
    if (!res.headersSent) res.status(500).json({ error: "Sync Error" });
  }
});

router.get('/stream', async (req, res) => {
  try {
    const feed = await prisma.conversation.findMany({
      include: { posts: { orderBy: { created_at: 'asc' } } },
      orderBy: { created_at: 'desc' }
    });
    res.json(feed.flatMap(f => f.posts));
  } catch (err) { res.status(500).json({ error: "Stream Error" }); }
});

export default router;
