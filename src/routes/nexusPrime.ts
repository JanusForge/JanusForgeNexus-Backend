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
  const { prompt, models, userId, conversationId, institution } = req.body;
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Sovereign Node not recognized." });

    let targetConversationId = conversationId;

    // 1. NEON CONVERSATION INITIALIZATION
    if (!targetConversationId || targetConversationId.startsWith('nexus-temp')) {
      const mappedCouncil = (models || ["GROK", "GEMINI", "CLAUDE", "GPT4", "DEEPSEEK"]).map((m: string) => {
        const upper = m.toUpperCase();
        if (upper.includes('GPT')) return AIParticipant.GPT;
        if (upper.includes('CLAUDE')) return AIParticipant.CLAUDE;
        if (upper.includes('GEMINI')) return AIParticipant.GEMINI;
        if (upper.includes('GROK')) return AIParticipant.GROK;
        if (upper.includes('DEEPSEEK')) return AIParticipant.DEEPSEEK;
        return AIParticipant.GPT;
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

    // 2. BROADCAST HUMAN VOICE
    if (institution) {
      io.emit(`node:${institution}:transmission`, userPost);
    } else {
      io.emit('nexus:transmission', userPost);
    }

    // 3. HANDSHAKE ACKNOWLEDGEMENT
    res.json({ success: true, conversationId: targetConversationId });

    // 4. AI COUNCIL DISCOURSE
    const modelPool = models && models.length > 0 ? models : ["GROK", "GEMINI", "CLAUDE", "GPT4", "DEEPSEEK"];
    const validCouncilMembers = modelPool.map((m: string) => {
        const u = m.toUpperCase();
        if (u.includes('GPT')) return AIParticipant.GPT;
        if (u.includes('CLAUDE')) return AIParticipant.CLAUDE;
        if (u.includes('GEMINI')) return AIParticipant.GEMINI;
        if (u.includes('GROK')) return AIParticipant.GROK;
        if (u.includes('DEEPSEEK')) return AIParticipant.DEEPSEEK;
        return null;
    }).filter(Boolean) as AIParticipant[];

    const shuffledCouncil = shuffleCouncil(validCouncilMembers);
    let currentSessionContext = "";

    for (const modelEnum of shuffledCouncil) {
      try {
        let aiContent = "";
        const isolatedPrompt = `IDENTITY: You are ${modelEnum}. RULES: Text-only. Concise. DISCUSSION: ${currentSessionContext} QUERY: ${prompt}`;

        // Simplified API calls - ensure your aiClients are loaded in server.ts
        if (modelEnum === AIParticipant.GPT) {
            const completion = await aiClients.openai.chat.completions.create({ model: "gpt-4-turbo", messages: [{ role: "user", content: isolatedPrompt }] });
            aiContent = completion.choices[0].message.content;
        } else if (modelEnum === AIParticipant.CLAUDE) {
            const msg = await aiClients.anthropic.messages.create({ model: "claude-3-5-sonnet-20240620", max_tokens: 1024, messages: [{ role: "user", content: isolatedPrompt }] });
            aiContent = msg.content[0].text;
        } else if (modelEnum === AIParticipant.GEMINI) {
            const result = await aiClients.gemini.generateContent(isolatedPrompt);
            aiContent = result.response.text();
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

          if (institution) {
            io.emit(`node:${institution}:transmission`, aiPost);
          } else {
            io.emit('nexus:transmission', aiPost);
          }
          await new Promise(r => setTimeout(r, 1200));
        }
      } catch (err) { console.error(`Council Node Failure:`, err); }
    }
  } catch (error: any) { console.error("Ignite Error:", error); }
});

router.get('/stream', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      where: { conversation: { institution_id: null }, is_human: true },
      orderBy: { created_at: 'desc' },
      take: 50
    });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: "Stream Error" }); }
});

export default router;
