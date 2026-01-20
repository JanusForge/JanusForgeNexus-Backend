// src/routes/nexusPrime.ts

import express from 'express';
import prisma from '../lib/prisma';
import { aiClients } from '../server';
import { AIParticipant } from '@prisma/client';

const router = express.Router();

/**
 * 🎲 Fisher-Yates Shuffle
 * Ensures a perfectly fair and random order for the Council members.
 */
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
    let targetConversationId = conversationId;

    const modelMap: Record<string, AIParticipant> = {
      'CLAUDE': AIParticipant.CLAUDE,
      'GPT4': AIParticipant.CHATGPT,
      'GEMINI': AIParticipant.GEMINI_PRO,
      'GROK': AIParticipant.GROK,
      'DEEPSEEK': AIParticipant.DEEPSEEK
    };

    const validCouncilMembers = models
      .map((m: string) => modelMap[m])
      .filter((m: any) => m !== undefined);

    // 1. Establish Conversation
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

    // 2. Save User Entry
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

    // 3. Emit User Post & Release UI
    io.emit('nexus:transmission', userPost);
    if (!parentPostId) io.emit('nexus:new_root', userPost);
    res.json({ success: true, conversationId: targetConversationId });

    // 🚀 4. SEQUENTIAL RANDOMIZED ACTIVATION
    const randomizedCouncil = shuffleCouncil(validCouncilMembers);

    for (const modelEnum of randomizedCouncil) {
      try {
        let aiContent = "";

        /**
         * 🛡️ PERSONA ISOLATION PROMPT
         * This prevents "Puppet Mastering" by strictly defining the AI's role.
         */
        const isolatedPrompt = `### YOUR IDENTITY: You are ${modelEnum}.
### MISSION: Respond ONLY as yourself. Do not simulate, name, or write for any other Council members.
### QUERY: ${prompt}`;

        // Model Dispatcher
        if (modelEnum === AIParticipant.CLAUDE) {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-3-7-sonnet-latest",
            max_tokens: 1024,
            messages: [{ role: "user", content: isolatedPrompt }],
          });
          aiContent = msg.content[0].text;
        } 
        else if (modelEnum === AIParticipant.CHATGPT) {
          const comp = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: isolatedPrompt }],
          });
          aiContent = comp.choices[0].message.content || "";
        } 
        else if (modelEnum === AIParticipant.GEMINI_PRO) {
          const model = aiClients.GEMINI.getGenerativeModel({ model: "gemini-2.0-pro-exp" });
          const result = await model.generateContent(isolatedPrompt);
          aiContent = result.response.text();
        } 
        else if (modelEnum === AIParticipant.GROK) {
          const comp = await aiClients.GROK.chat.completions.create({
            model: "grok-3",
            messages: [{ role: "user", content: isolatedPrompt }]
          });
          aiContent = comp.choices[0].message.content || "";
        } 
        else if (modelEnum === AIParticipant.DEEPSEEK) {
          const comp = await aiClients.DEEPSEEK.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: isolatedPrompt }]
          });
          aiContent = comp.choices[0].message.content || "";
        }

        if (aiContent) {
          // Save and Emit one by one
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

          io.emit('nexus:transmission', aiPost);
          
          // ⏱️ Breathe: Prevents WebSocket Race Conditions
          await new Promise(resolve => setTimeout(resolve, 500)); 
        }
      } catch (err) {
        console.error(`Council Failure [${modelEnum}]:`, err);
      }
    }
  } catch (error) {
    console.error("Nexus Ignition Failure:", error);
    if (!res.headersSent) res.status(500).send("Sync Error");
  }
});

router.get('/stream', async (req, res) => {
  try {
    const feed = await prisma.conversation.findMany({
      where: { is_public: true },
      include: { posts: { orderBy: { created_at: 'asc' } } },
      orderBy: { created_at: 'desc' }
    });
    res.json(feed.flatMap(f => f.posts));
  } catch (err) { res.status(500).send("Stream Error"); }
});

export default router;
