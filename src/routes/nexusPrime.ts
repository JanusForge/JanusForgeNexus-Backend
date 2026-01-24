// src/routes/nexusPrime.ts (Surgically Updated for 2026 Council Synthesis)

import express from 'express';
import { prisma } from '../lib/prisma'; // Ensure this matches your prisma export path
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
    // 🚦 PHASE 1: Simple 30-second cooldown per user
    const lastPost = await prisma.post.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });

    if (lastPost && (Date.now() - new Date(lastPost.created_at).getTime() < 30000)) {
      return res.status(429).json({ error: "The Forge is cooling down. Please wait 30 seconds." });
    }

    let targetConversationId = conversationId;

    // 🏛️ ALIGNED ENUM MAP (Matches schema.prisma)
    const modelMap: Record<string, AIParticipant> = {
      'CLAUDE': AIParticipant.CLAUDE,
      'GPT4': AIParticipant.GPT,      // Changed from CHATGPT to GPT
      'GEMINI': AIParticipant.GEMINI, // Changed from GEMINI_PRO to GEMINI
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
    
    // Return early so frontend knows ignition was successful
    res.json({ success: true, conversationId: targetConversationId });

    // 🚀 SEQUENTIAL RANDOMIZED ACTIVATION WITH ROLLING CONTEXT
    const randomizedCouncil = shuffleCouncil(validCouncilMembers);
    let rollingContext = `User Query: ${prompt}\n\n`;

    for (const modelEnum of randomizedCouncil) {
      try {
        let aiContent = "";
        const isolatedPrompt = `### THE NEXUS COUNCIL SO FAR:\n${rollingContext}\n\n### YOUR IDENTITY: You are ${modelEnum}.\n### MISSION: Analyze the query and previous Council responses. Provide your unique synthesis. Respond ONLY as yourself.\n\n### YOUR RESPONSE:`;

        // --- CLAUDE ---
        if (modelEnum === AIParticipant.CLAUDE) {
          const claudeFallbacks = ["claude-3-5-sonnet-latest", "claude-3-opus-latest"];
          for (const m of claudeFallbacks) {
            try {
              const msg = await aiClients.CLAUDE.messages.create({
                model: m,
                max_tokens: 1024,
                messages: [{ role: "user", content: isolatedPrompt }],
              });
              aiContent = msg.content[0].text;
              if (aiContent) break;
            } catch (e) { console.warn(`Claude [${m}] fallback triggered.`); }
          }
        }
        // --- GPT ---
        else if (modelEnum === AIParticipant.GPT) {
          const comp = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: isolatedPrompt }],
          });
          aiContent = comp.choices[0].message.content || "";
        }
        // --- GEMINI ---
        else if (modelEnum === AIParticipant.GEMINI) {
          const geminiFallbacks = ["gemini-1.5-pro", "gemini-1.5-flash"];
          for (const m of geminiFallbacks) {
            try {
              const model = aiClients.GEMINI.getGenerativeModel({ model: m });
              const result = await model.generateContent(isolatedPrompt);
              aiContent = result.response.text();
              if (aiContent) break;
            } catch (e) { console.warn(`Gemini [${m}] fallback triggered.`); }
          }
        }
        // --- GROK ---
        else if (modelEnum === AIParticipant.GROK) {
          const comp = await aiClients.GROK.chat.completions.create({
            model: "grok-2-latest",
            messages: [{ role: "user", content: isolatedPrompt }]
          });
          aiContent = comp.choices[0].message.content || "";
        }
        // --- DEEPSEEK ---
        else if (modelEnum === AIParticipant.DEEPSEEK) {
          const comp = await aiClients.DEEPSEEK.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: isolatedPrompt }]
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

          rollingContext += `${modelEnum}: ${aiContent}\n\n`;
          io.emit('nexus:transmission', aiPost);
          await new Promise(resolve => setTimeout(resolve, 800)); // Breathing room
        }
      } catch (err) {
        console.error(`Council Failure [${modelEnum}]:`, err);
      }
    }
  } catch (error: any) {
    console.error("Nexus Ignition Failure:", error);
    if (!res.headersSent) {
      // 🛡️ JSON error response prevents "Unexpected token S" on frontend
      res.status(500).json({ error: "Sync Error", details: error.message });
    }
  }
});

router.get('/stream', async (req, res) => {
  try {
    const feed = await prisma.conversation.findMany({
      where: { is_public: true },
      include: {
        posts: {
          orderBy: { created_at: 'asc' },
          include: {
            user: { select: { is_founder: true } }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(feed.flatMap(f => f.posts));
  } catch (err) { 
    res.status(500).json({ error: "Stream Error" }); 
  }
});

export default router;
