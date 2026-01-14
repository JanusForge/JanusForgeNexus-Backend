import prisma from '../../lib/prisma';
import { aiClients } from '../../server';

interface SynthesisOptions {
  conversationId: string;
  prompt: string;
  io: any;
}

/**
 * UNIVERSAL ADAPTER (JAN 2026)
 * Orchestrates the 5-Node Frontier Cluster using Tiered Reasoning for max profit/performance.
 */
const getModelResponse = async (modelName: string, system: string, prompt: string) => {
  const client = aiClients[modelName as keyof typeof aiClients];
  
  switch (modelName) {
    case 'CLAUDE':
      // Using Claude 4.5 Opus: The 2026 Global SOTA for reasoning and ethics.
      const msg = await client.messages.create({
        model: "claude-opus-4-5-20251101", 
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: prompt }]
      });
      return msg.content[0].text;

    case 'GEMINI':
      // Using Gemini 3 Flash: Pro-level logic at a fraction of the cost.
      const genModel = client.getGenerativeModel({ model: "gemini-3-flash-preview" });
      const result = await genModel.generateContent(`${system}\n\n${prompt}`);
      return result.response.text();

    default: 
      // GPT-5.2, GROK-4.1, and DEEPSEEK V3.2 (OpenAI-Compatible SDKs)
      const modelMap: Record<string, string> = {
        'GPT4': 'gpt-5-2-chat-latest',  // Flagship reasoning node
        'GROK': 'grok-4-1-fast-reasoning', // High-speed, real-time node
        'DEEPSEEK': 'deepseek-chat'     // Non-thinking V3.2 for fast analysis
      };
      
      const completion = await client.chat.completions.create({
        model: modelMap[modelName],
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ],
      });
      return completion.choices[0].message.content;
  }
};

/**
 * ADVERSARIAL SYNTHESIS ENGINE
 * Orchestrates the autonomous adversarial flow between nodes.
 */
export async function runAdversarialSynthesis({
  conversationId,
  prompt,
  io
}: SynthesisOptions) {
  const models = ['CLAUDE', 'GPT4', 'GEMINI', 'GROK', 'DEEPSEEK'];
  let debateContext = `Initial Directive: ${prompt}\n\n`;

  // 1. GENERATE CINEMATIC TITLE (First Action)
  try {
    const title = await getModelResponse(
      'CLAUDE', 
      "You are the Janus Forge Title Engine.", 
      `Synthesize a 3-5 word striking, autonomous title for: "${prompt}". No quotes.`
    );

    if (title) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: title.trim().replace(/["']/g, "") }
      });
      io.to(conversationId).emit('sidebar:update');
    }
  } catch (err) {
    console.error("Title Node Error:", err);
  }

  // 2. THE ADVERSARIAL LOOP
  for (const modelName of models) {
    try {
      const systemDirective = `
        You are node ${modelName} in the Nexus Prime Frontier Cluster.
        Challenge the consensus of previous nodes. Be incisive, not encyclopedic.
        Current Cluster Status: Active.
      `;

      const content = await getModelResponse(modelName, systemDirective, debateContext);
      if (!content) continue;

      // Save to Database
      const post = await prisma.post.create({
        data: {
          content,
          is_human: false,
          name: modelName,
          conversation_id: conversationId,
          sender: 'ai'
        }
      });

      // Stream to Frontend
      io.to(conversationId).emit('post:incoming', {
        id: post.id,
        name: modelName,
        content,
        sender: 'ai',
        created_at: post.created_at
      });

      debateContext += `\n[Node ${modelName} Synthesis]: ${content}\n`;
      
      // Cinematic Processing Delay
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (err) {
      console.error(`Node ${modelName} failure:`, err);
    }
  }

  // Signal completion
  io.to(conversationId).emit('synthesis:complete');
}
