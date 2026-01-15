import { aiClients } from '../../server';
import prisma from '../../lib/prisma';
import crypto from 'crypto';

interface SynthesisParams {
  conversationId: string;
  prompt: string;
  selectedModels: string[]; // e.g., ['CLAUDE', 'GPT4', 'GEMINI', 'GROK', 'DEEPSEEK']
  io: any;
  isMaster: boolean; // Site owner bypass
}

/**
 * 🚀 FRONTIER COUNCIL SYNTHESIS ENGINE
 * Orchestrates parallel adversarial reasoning from the world's leading AI models.
 */
export const runAdversarialSynthesis = async ({
  conversationId,
  prompt,
  selectedModels,
  io,
  isMaster
}: SynthesisParams) => {
  const COST_PER_MODEL = 5;
  const totalCost = selectedModels.length * COST_PER_MODEL;

  try {
    // 1. Initial State Broadcast to the Private Firebreak Namespace
    const nexusNamespace = io.of('/nexus-prime');
    nexusNamespace.to(conversationId).emit('synthesis:status', { 
      message: "Frontier Council assembled. Synchronizing adversarial clusters..." 
    });

    // 2. Parallel Adversarial Execution (2026 Models)
    const synthesisTasks = selectedModels.map(async (modelKey) => {
      try {
        let responseText = "";
        const adversarialPrompt = `[JANUS CORE ADVERSARIAL TASK] Provide a deep strategic analysis of the user's prompt. Challenge the underlying assumptions and identify unique opportunities. Prompt: ${prompt}`;

        // --- Model Routing (Updated January 2026) ---
        if (modelKey === 'CLAUDE') {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-4-5-sonnet-20251022", // Latest 2026 Frontier Model
            max_tokens: 1500,
            messages: [{ role: "user", content: adversarialPrompt }],
          });
          responseText = msg.content[0].type === 'text' ? msg.content[0].text : "";
        }
        else if (modelKey === 'GPT4') {
          const completion = await aiClients.GPT4.chat.completions.create({
            model: "gpt-5.2-high", // Current top-tier reasoning model
            messages: [{ role: "user", content: adversarialPrompt }],
          });
          responseText = completion.choices[0].message.content || "";
        }
        else if (modelKey === 'GEMINI') {
          const model = aiClients.GEMINI.getGenerativeModel({ model: "gemini-3-pro" }); // Current Google Standard
          const result = await model.generateContent(adversarialPrompt);
          responseText = result.response.text();
        }
        else if (modelKey === 'GROK') {
          // xAI Grok 4.1 reasoning logic
          const completion = await aiClients.GROK.chat.completions.create({
            model: "grok-4.1-fast-reasoning",
            messages: [{ role: "user", content: adversarialPrompt }],
          });
          responseText = completion.choices[0].message.content || "";
        }
        else if (modelKey === 'DEEPSEEK') {
          // DeepSeek V3.2 "Thinking" Mode
          const completion = await aiClients.DEEPSEEK.chat.completions.create({
            model: "deepseek-reasoner",
            messages: [{ role: "user", content: adversarialPrompt }],
          });
          responseText = completion.choices[0].message.content || "";
        }

        // --- Real-Time Stream Event ---
        nexusNamespace.to(conversationId).emit('post:incoming', {
          id: crypto.randomUUID(),
          name: modelKey,
          content: responseText,
          sender: 'ai'
        });

        return { model: modelKey, content: responseText };
      } catch (err: any) {
        console.error(`🔴 Nexus Engine: ${modelKey} failure:`, err.message);
        return { model: modelKey, content: `[SYSTEM ERROR] ${modelKey} is currently desynchronized from the cluster.` };
      }
    });

    const results = await Promise.all(synthesisTasks);

    // 3. Token Economy Verification
    if (!isMaster) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { user_id: true }
      });

      if (conversation?.user_id) {
        await prisma.user.update({
          where: { id: conversation.user_id },
          data: { tokens_remaining: { decrement: totalCost } }
        });
      }
    }

    // 4. Persistence Layer
    await prisma.post.createMany({
      data: results.map(res => ({
        content: res.content,
        name: res.model,
        is_human: false,
        conversation_id: conversationId
      }))
    });

    // 5. Completion Broadcast
    nexusNamespace.to(conversationId).emit('synthesis:complete', {
      status: 'success',
      final_balance_display: isMaster ? 999789 : undefined
    });

  } catch (error) {
    console.error("🌌 CRITICAL NEXUS CORE ENGINE FAILURE:", error);
    io.of('/nexus-prime').to(conversationId).emit('synthesis:error', { 
      message: "The Frontier Council has lost synchronization. Please retry ignition." 
    });
  }
};
