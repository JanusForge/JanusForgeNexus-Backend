import { aiClients } from '../../server';
import prisma from '../../lib/prisma';

interface SynthesisParams {
  conversationId: string;
  prompt: string;
  selectedModels: string[]; // e.g., ['CLAUDE', 'GPT4', 'GEMINI']
  io: any;
  isMaster: boolean; // Site owner bypass
}

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
    // 1. Initial State Broadcast
    io.to(conversationId).emit('synthesis:status', { message: "Initializing Frontier Cluster..." });

    // 2. Parallel Adversarial Execution
    // We trigger all selected models simultaneously to minimize latency
    const synthesisTasks = selectedModels.map(async (modelKey) => {
      try {
        let responseText = "";
        
        // --- Model Specific Routing ---
        if (modelKey === 'CLAUDE') {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1024,
            messages: [{ role: "user", content: `ADVERSARIAL SYNTHESIS TASK: ${prompt}` }],
          });
          responseText = msg.content[0].type === 'text' ? msg.content[0].text : "";
        } 
        else if (modelKey === 'GPT4') {
          const completion = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: `ADVERSARIAL SYNTHESIS TASK: ${prompt}` }],
          });
          responseText = completion.choices[0].message.content || "";
        }
        else if (modelKey === 'GEMINI') {
          const model = aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" });
          const result = await model.generateContent(`ADVERSARIAL SYNTHESIS TASK: ${prompt}`);
          responseText = result.response.text();
        }
        // Add Grok and DeepSeek handlers here using their respective OpenAI-compatible clients

        // Stream the completed expert perspective to the frontend
        io.to(conversationId).emit('post:incoming', {
          id: crypto.randomUUID(),
          name: modelKey,
          content: responseText,
          sender: 'ai'
        });

        return { model: modelKey, content: responseText };
      } catch (err) {
        console.error(`Model ${modelKey} failed:`, err);
        return { model: modelKey, content: "Synthesis segment offline." };
      }
    });

    const results = await Promise.all(synthesisTasks);

    // 3. Post-Synthesis Token Economy
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

    // 4. Persistence: Save all responses to the database
    await prisma.post.createMany({
      data: results.map(res => ({
        content: res.content,
        name: res.model,
        is_human: false,
        conversation_id: conversationId
      }))
    });

    io.to(conversationId).emit('synthesis:complete', { 
      status: 'success', 
      cost: isMaster ? 0 : totalCost 
    });

  } catch (error) {
    console.error("CRITICAL ENGINE FAILURE:", error);
    io.to(conversationId).emit('synthesis:error', { message: "Cluster desynchronized." });
  }
};
