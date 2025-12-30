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
    console.log(`📡 Requesting response from ${model}...`);
    if (model === 'CLAUDE') {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 600,
        system: mandates.CLAUDE,
        messages: [{ role: "user", content: query }],
      });
      return { model, content: msg.content[0].type === 'text' ? msg.content[0].text : "" };
    }
    if (model === 'GROK') {
      const completion = await grokClient.chat.completions.create({
        model: "grok-3",
        messages: [{ role: "system", content: mandates.GROK }, { role: "user", content: query }],
      });
      return { model, content: completion.choices[0].message.content };
    }
    return { model, content: `${model} is analyzing the directive through its mandate...` };
  } catch (err) {
    console.error(`❌ ${model} disruption:`, err);
    return { model, content: `${model} is experiencing a neural disruption.` };
  }
}

async function processArchitectCommand(forgeId: string) {
  console.log("🔍 Architect authority detected. Processing command...");
  const forge = await prisma.dailyForge.findUnique({ where: { id: forgeId } });
  const architect = await prisma.user.findFirst({ where: { role: 'GOD_MODE' } });

  if (!architect) {
    console.error("❌ Architect authority not confirmed.");
    return;
  }

  const models = ['CLAUDE', 'GROK', 'DEEPSEEK', 'GEMINI_PRO', 'CHATGPT'];
  const responses = await Promise.all(models.map(m => generateCouncilResponse(m, forge?.winningTopic || "")));

  console.log("💾 Synchronizing Council findings with Neon...");
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
  let success = false;
  try {
    console.log("🔌 Connecting to Database...");
    const latestForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });

    // 🧹 AUTO-RESET LOGIC
    if (latestForge && latestForge.phase === 'COUNCIL_DEBATE') {
      console.log("🧹 Auto-Reset: Initializing Forge for the new patrol cycle.");
      await prisma.dailyForge.update({
        where: { id: latestForge.id },
        data: { phase: 'Architect_Interjection' }
      });
      latestForge.phase = 'Architect_Interjection';
    }

    if (latestForge?.phase === 'Architect_Interjection') {
      await processArchitectCommand(latestForge.id);
      success = true;
    } else {
      console.log(`ℹ️ Forge is in phase: ${latestForge?.phase}. No action required.`);
      success = true;
    }

  } catch (e) {
    console.error("❌ Patrol Error:", e);
  } finally {
    console.log("🏁 Patrol complete. Closing connection.");
    
    if (success && process.env.HEARTBEAT_URL) {
      try {
        await fetch(process.env.HEARTBEAT_URL);
        console.log("💓 Heartbeat sent to Monitoring Center.");
      } catch (hbErr) {
        console.error("⚠️ Failed to send Heartbeat ping.");
      }
    }

    await prisma.$disconnect();
    process.exit(0);
  }
}

patrolTheForge();
