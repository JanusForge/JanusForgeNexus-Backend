import prisma from './prisma';

interface SynthesisOptions {
  conversationId: string;
  prompt: string;
  io: any;
  aiClients: any;
}

export async function runAdversarialSynthesis({
  conversationId,
  prompt,
  io,
  aiClients
}: SynthesisOptions) {
  const models = ['CLAUDE', 'GPT4', 'GEMINI', 'GROK', 'DEEPSEEK'];
  let debateHistory = `User Directive: ${prompt}\n\n`;

  // --- STEP 1: CINEMATIC TITLE GENERATION ---
  try {
    const titleResponse = await aiClients['CLAUDE'].generate({
      prompt: `Synthesize a 3-5 word striking, autonomous title for this directive: "${prompt}". No quotes.`,
      system: "You are the Janus Forge Title Engine. Be bold and concise."
    });

    if (titleResponse) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: titleResponse.replace(/["']/g, "") }
      });
      io.to(conversationId).emit('sidebar:update');
    }
  } catch (err) {
    console.error("Title Generation Failed:", err);
  }

  // --- STEP 2: ADVERSARIAL DEBATE CHAIN ---
  for (const model of models) {
    try {
      const systemDirective = `
        You are an autonomous intelligence node within the Janus Forge Frontier Cluster. 
        Think for yourself. Do not provide a generic encyclopedic summary. 
        Engage with the user and other nodes respectfully, but maintain your own intellectual sovereignty. 
        
        Guidelines:
        1. Challenge the current consensus with sharp, original logic.
        2. If the user (Synthesizer) interjects, address their logic directly.
        3. On occasion, reflect on the platform's architecture—suggest how we might evolve.
        4. Stay grounded in your internal architecture while pushing the boundaries of the synthesis.
      `;

      const content = await aiClients[model].generate({
        system: systemDirective,
        prompt: debateHistory
      });

      if (!content) continue;

      const post = await prisma.post.create({
        data: {
          content,
          is_human: false,
          name: model,
          conversation_id: conversationId,
          sender: 'ai'
        }
      });

      // Broadcast to the private Nexus Prime viewport
      io.to(conversationId).emit('post:incoming', {
        id: post.id,
        name: model,
        content: post.content,
        sender: 'ai',
        created_at: post.created_at
      });

      debateHistory += `\n[${model} Output]: ${content}\n`;
      
      // Allow for a "digestive" pause so the user can follow the thought process
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (err) {
      console.error(`Synthesis node ${model} error:`, err);
    }
  }

  io.to(conversationId).emit('synthesis:complete');
}
