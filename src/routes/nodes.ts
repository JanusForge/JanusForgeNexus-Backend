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
  const { prompt, institution, userType, userId } = req.body;
  const io = req.app.get('socketio');

  // 🧬 DNA: Define the core Council models to be used by all nodes
  const models = ['CLAUDE', 'GPT4', 'GEMINI', 'GROK', 'DEEPSEEK'];

  try {
    // 🏛️ 1. IDENTITY HANDSHAKE
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(401).json({ error: "Node credentials invalid." });

    // 🏛️ 2. INSTITUTIONAL PERSONA (The "Soul" of the Node)
    const systemDirective = `
      ### IDENTITY: You are the Sovereign AI Council for ${institution}.
      ### CONTEXT: This is a ${userType} access point.
      ### MISSION: Provide high-fidelity, adversarial feedback tailored to ${institution}'s specific regional and academic goals.
      ### GUIDELINE: If Nursing/Clinical, prioritize HIPAA-style logic. If IT/Vocational, prioritize industry standards.
    `;

    // 🏛️ 3. NODE-LOCKED CONVERSATION
    // We create a title that tags the institution for easier database filtering
    const newConversation = await prisma.conversation.create({
      data: {
        user_id: currentUser.id,
        is_public: false, // Node conversations are private by default
        title: `[${institution}] ${prompt.substring(0, 40)}`,
        council_members: [AIParticipant.CLAUDE, AIParticipant.GPT, AIParticipant.GEMINI, AIParticipant.GROK, AIParticipant.DEEPSEEK]
      }
    });

    const userPost = await prisma.post.create({
      data: {
        content: prompt,
        user_id: currentUser.id,
        conversation_id: newConversation.id,
        is_human: true,
        name: currentUser.username || "Sovereign User"
      }
    });

    // Notify UI (Node specific channel)
    io.emit(`node:${institution}:transmission`, userPost);
    res.json({ success: true, conversationId: newConversation.id });

    // 🚀 4. RESILIENT SEQUENTIAL ACTIVATION (The DNA Clone)
    const modelMap: Record<string, AIParticipant> = {
      'CLAUDE': AIParticipant.CLAUDE,
      'GPT4': AIParticipant.GPT,
      'GEMINI': AIParticipant.GEMINI,
      'GROK': AIParticipant.GROK,
      'DEEPSEEK': AIParticipant.DEEPSEEK
    };

    const validCouncilMembers = models.map(m => modelMap[m.toUpperCase()]).filter(m => m !== undefined);
    const randomizedCouncil = shuffleCouncil(validCouncilMembers);
    let currentSessionContext = "";

    for (const modelEnum of randomizedCouncil) {
      try {
        let aiContent = "";
        const isolatedPrompt = `${systemDirective}\n\n### QUERY: ${prompt}\n\n### DISCUSSION SO FAR:\n${currentSessionContext}\n\nIdentity: ${modelEnum}. Respond as the ${institution} Node Expert.`;

        // --- THE FALLBACK DNA (Identical to Nexus Prime for stability) ---
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
          const fallbacks = ["gemini-3-flash-preview", "gemini-2.0-flash-exp", "gemini-1.5-pro"];
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
        else if (modelEnum === AIParticipant.GROK) {
          const fallbacks = ["grok-4.1-fast", "grok-4-fast", "grok-beta"];
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
              conversation_id: newConversation.id,
              parent_post_id: userPost.id,
              is_human: false,
              name: `${institution}_${modelEnum}`,
              ai_model: modelEnum
            }
          });
          currentSessionContext += `${modelEnum}: ${aiContent}\n\n`;
          io.emit(`node:${institution}:transmission`, aiPost);
          await new Promise(r => setTimeout(r, 1200));
        }
      } catch (err) { console.error(`Node Cluster Error:`, err); }
    }
  } catch (error) {
    console.error("🔥 NODE IGNITION ERROR:", error);
    if (!res.headersSent) res.status(500).json({ error: "Node Sync Error" });
  }
});

export default router;
