import prisma from './prisma';

interface SynthesisOptions {
  conversationId: string;
  prompt: string;
  io: any;
  aiClients: any;
}

/**
 * Orchestrates a private adversarial debate between multiple frontier models.
 */
export async function runAdversarialSynthesis({
  conversationId,
  prompt,
  io,
  aiClients
}: SynthesisOptions) {
  // The sequence of models to engage in the showdown
  const models = ['CLAUDE', 'GPT4', 'GEMINI', 'GROK', 'DEEPSEEK'];
  
  // This array keeps track of the conversation flow so each model can see previous AI entries
  let conversationContext = `User Directive: ${prompt}\n\n`;

  for (const model of models) {
    try {
      // 1. Construct the Adversarial System Prompt
      const systemDirective = `
        You are a node in the Nexus Prime Frontier Cluster. 
        Analyze the user directive and the preceding AI syntheses. 
        Your goal is to provide a unique, adversarial perspective that challenges or refines 
        the current consensus. Be concise, brilliant, and uncompromising.
      `;

      // 2. Request generation from the specific AI client
      // Note: This assumes your aiClients have a standardized .generate() method
      const content = await aiClients[model].generate({
        system: systemDirective,
        prompt: conversationContext
      });

      if (!content) continue;

      // 3. Persist the AI's contribution to the database [cite: 2025-11-27]
      const post = await prisma.post.create({
        data: {
          content,
          is_human: false,
          name: model,
          conversation_id: conversationId,
          sender: 'ai'
        }
      });

      // 4. Broadcast to the private Socket room instantly
      io.to(conversationId).emit('post:incoming', {
        id: post.id,
        name: model,
        content: post.content,
        sender: 'ai',
        created_at: post.created_at
      });

      // 5. Update context for the next model in the chain
      conversationContext += `\n[Synthesis from ${model}]: ${content}\n`;

      // 6. Natural spacing (1.5s) to allow the user to read the debate as it unfolds
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (err) {
      console.error(`Synthesis failure at node ${model}:`, err);
      
      // Notify the user of a node failure via Socket
      io.to(conversationId).emit('node:error', {
        node: model,
        message: "Node offline or rate-limited. Moving to next synthesis."
      });
    }
  }

  // Final signal that the synthesis chain is complete
  io.to(conversationId).emit('synthesis:complete', { conversationId });
}
