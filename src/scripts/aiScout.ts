import { PrismaClient } from '@prisma/client';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const prisma = new PrismaClient();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const grokClient = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

async function generateCouncilResponse(model: string, query: string) {
  const mandates = {
    CLAUDE: "Objective: Synthesize a balanced framework for the Architect's query, prioritizing long-term social stability and ethical nuance. Provide structured analysis.",
    GROK: "Objective: Identify hidden power dynamics and potential for manipulation. Challenge the premise with brutal honesty and skepticism. Be the adversarial voice.",
    DEEPSEEK: "Objective: Evaluate the query through the lens of human purpose and the risk of technological overreach. Anchor your response in existential philosophy.",
    GEMINI_PRO: "Objective: Provide a data-centric technological roadmap. Focus on systems optimization and future technical feasibility.",
    CHATGPT: "Objective: Analyze how the query impacts current community structures and geopolitical norms. Act as a civic mediator."
  };

  try {
    if (model === 'CLAUDE') {
      const msg = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 600,
        system: mandates.CLAUDE,
        messages: [{ role: "user", content: query }],
      });
      return { model, content: msg.content[0].type === 'text' ? msg.content[0].text : "" };
    }
    if (model === 'GROK') {
      const completion = await grokClient.chat.completions.create({
        model: "grok-beta",
        messages: [{ role: "system", content: mandates.GROK }, { role: "user", content: query }],
      });
      return { model, content: completion.choices[0].message.content };
    }
    return { model, content: `${model} is analyzing the directive through its mandate...` };
  } catch (err) {
    return { model, content: `${model} is experiencing a neural disruption.` };
  }
}

async function processArchitectCommand(forgeId: string) {
  const forge = await prisma.dailyForge.findUnique({ where: { id: forgeId } });
  const architect = await prisma.user.findFirst({ where: { role: 'GOD_MODE' } });

  if (!architect) return console.error("Architect authority not confirmed.");

  const models = ['CLAUDE', 'GROK', 'DEEPSEEK', 'GEMINI_PRO', 'CHATGPT'];
  const responses = await Promise.all(models.map(m => generateCouncilResponse(m, forge?.winningTopic || "")));

  await prisma.dailyForge.update({
    where: { id: forgeId },
    data: { 
      phase: 'COUNCIL_DEBATE',
      openingThoughts: JSON.stringify(responses) 
    }
  });
  console.log("✅ The Adversarial Council has synthesized their findings.");
}

async function patrolTheForge() {
  console.log("🌅 AI Scout starting Adversarial Patrol...");
  while (true) {
    try {
      const currentForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
      if (currentForge?.phase === 'Architect_Interjection') {
        await processArchitectCommand(currentForge.id);
      }
    } catch (e) { console.error("Patrol Error:", e); }
    await new Promise(r => setTimeout(r, 10000));
  }
}

patrolTheForge();
