import prisma from '../../lib/prisma';

interface SynthesisOptions {
  conversationId: string;
  prompt: string;
  io: any; // Socket.io instance
  aiClients: any; // Your mapped AI API clients
}

/**
 * Orchestrates the autonomous adversarial debate between frontier nodes.
 */
export async function runAdversarialSynthesis({
  conversationId,
  prompt,
  io,
  aiClients
}: SynthesisOptions) {
  // Define the cluster sequence
  const models = ['CLAUDE', 'GPT4', 'GEMINI', 'GROK', 'DEEPSEEK'];
  
  // The context built as the debate progresses
  let debateContext = `Initial Directive: ${prompt}\n\n`;

  // 1. GENERATE CINEMATIC TITLE (First Action)
  try {
    const title = await aiClients['CLAUDE'].generate({
      prompt: `Synthesize a 3-5 word striking, autonomous title for this directive: "${prompt}". No quotes, no filler.`,
      system: "You are the Janus Forge Title Engine."
    });

    if (title) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: title.trim().replace(/["']/g, "") }
      });
      // Tell sidebar to refresh titles
      io.to(conversationId).emit('sidebar:update');
    }
  } catch (err) {
    console.error("Title Node Error:", err);
  }

  // 2. RUN ADVERSARIAL CHAIN
  for (const model of models) {
    try {
      const systemDirective = `
        You are an autonomous node in the Nexus Prime Frontier Cluster. 
        Think independently. Challenge the consensus of previous nodes with sharp logic.
        Do not be encyclopedic. If the user interjects, address them directly.
        Respect the collective, but maintain intellectual sovereignty.
      `;

      // Request generation from the cluster node
      const content = await aiClients[model].generate({
        system: systemDirective,
        prompt: debateContext
      });

      if (!content) continue;

      // Persist the contribution with the node's name
      const post = await prisma.post.create({
        data: {
          content,
          is_human: false,
          name: model, // Using the new 'name' field from our DB push
          conversation_id: conversationId,
          sender: 'ai'
        }
      });

      // Broadcast to the private viewport in real-time
      io.to(conversationId).emit('post:incoming', {
        id: post.id,
        name: model,
        content: post.content,
        sender: 'ai',
        created_at: post.created_at
      });

      // Update the thread context for the next node
      debateContext += `\n[Node ${model} Synthesis]: ${content}\n`;

      // Cinematic pause to allow user processing
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (err) {
      console.error(`Synthesis Node Failure [${model}]:`, err);
    }
  }

  // Finalize the chain
  io.to(conversationId).emit('synthesis:complete');
}
