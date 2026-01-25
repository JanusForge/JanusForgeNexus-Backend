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

// 🏛️ History Logic (Keep this, it works)
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

// 🚀 REPLICATED PRIME ENGINE
router.post('/ignite', async (req: any, res) => {
  const { prompt, institution, userType, userId, conversationId } = req.body;
  const io = req.app.get('socketio');

  try {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Access Denied" });

    // 🧬 THE PRIME DIRECTIVE: EXACTLY AS USED IN YOUR SUCCESSFUL TEST
    const systemDirective = `### IDENTITY: You are a member of the Sovereign AI Council for ${institution}. 
    ### MISSION: Perform a Grand Synthesis for a ${userType} user. 
    ### FORMAT: Provide a structured response with an Executive Summary and Adversarial Peer Review. Use Markdown (###) for headers and double-spacing between sections.`;

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
      data: { content: prompt, user_id: currentUser.id, conversation_id: conversation.id, is_human: true, name: currentUser.username }
    });

    io.emit(`node:${institution}:transmission`, userPost);
    res.json({ success: true, conversationId: conversation.id });

    const models = [AIParticipant.CLAUDE, AIParticipant.GPT, AIParticipant.GEMINI, AIParticipant.GROK, AIParticipant.DEEPSEEK];
    const randomizedCouncil = shuffleCouncil(models);
    let currentSessionContext = "";

    for (const modelEnum of randomizedCouncil) {
      try {
        let aiContent = "";
        const isolatedPrompt = `${systemDirective}\n\nUSER QUERY: ${prompt}\n\nPREVIOUS COUNCIL DISCUSSION:\n${currentSessionContext}\n\nRespond as ${modelEnum}:`;

        if (modelEnum === AIParticipant.GPT) {
          const comp = await aiClients.GPT4.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: isolatedPrompt }] });
          aiContent = comp.choices[0].message.content || "";
        } 
        else if (modelEnum === AIParticipant.GEMINI) {
          const model = aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" });
          const result = await model.generateContent(isolatedPrompt);
          aiContent = result.response.text();
        }
        else if (modelEnum === AIParticipant.CLAUDE) {
          const msg = await aiClients.CLAUDE.messages.create({ model: "claude-3-5-sonnet-latest", max_tokens: 2048, messages: [{ role: "user", content: isolatedPrompt }] });
          const textBlock = msg.content.find(b => b.type === 'text');
          if (textBlock && 'text' in textBlock) aiContent = textBlock.text;
        }
        else if (modelEnum === AIParticipant.GROK) {
          const comp = await aiClients.GROK.chat.completions.create({ model: "grok-4.1-fast", messages: [{ role: "user", content: isolatedPrompt }] });
          aiContent = comp.choices[0]?.message?.content || "";
        }
        else if (modelEnum === AIParticipant.DEEPSEEK) {
          const comp = await aiClients.DEEPSEEK.chat.completions.create({ model: "deepseek-chat", messages: [{ role: "user", content: isolatedPrompt }] });
          aiContent = comp.choices[0].message.content || "";
        }

        if (aiContent) {
          const aiPost = await prisma.post.create({
            data: { content: aiContent, conversation_id: conversation.id, parent_post_id: userPost.id, is_human: false, name: `${institution}_${modelEnum}`, ai_model: modelEnum }
          });
          currentSessionContext += `--- ${modelEnum} PERSPECTIVE ---\n${aiContent}\n\n`;
          io.emit(`node:${institution}:transmission`, aiPost);
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (err) { console.error(`Council Node Error (${modelEnum}):`, err); }
    }
  } catch (error) { res.status(500).json({ error: "Node Sync Error" }); }
});

export default router;
