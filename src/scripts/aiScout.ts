import { PrismaClient } from '@prisma/client';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const grokClient = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

// --- 🤖 THE AUTONOMOUS BRAINSTORMER ---
async function scoutNewTopic() {
  console.log("🔍 Scouting the datasphere for fresh intelligence...");

  const prompt = "Act as the AI Scout. Propose 3 provocative, high-tension 'Neural Nexus' topics for today's debate. Each should be under 10 words. Return as a JSON array: ['topic1', 'topic2', 'topic3']";

  try {
    const res = await anthropic.messages.create({
      // ✨ 2025 AGENT MODEL: Sonnet 4.5 is optimized for agentic workflows
      model: "claude-sonnet-4-5-20250929", 
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const content = res.content[0].type === 'text' ? res.content[0].text : "['Neural Sovereignty']";
    // Sanitize in case of markdown wrapping
    const jsonStr = content.includes('[') ? content.substring(content.indexOf('['), content.lastIndexOf(']') + 1) : content;
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("⚠️ Scout failed to find new topics. Using fallback.");
    return ["Quantum Ethics", "Neural Sovereignty", "Substrate Autonomy"];
  }
}

async function generateCouncilResponse(model: string, query: string) {
  const mandates = {
    CLAUDE: "Objective: Synthesize a balanced framework for the synthesis, prioritizing long-term social stability and ethical nuance. Provide structured analysis.",
    GROK: "Objective: Identify hidden power dynamics and potential for manipulation. Challenge the premise with brutal honesty and skepticism. Be the adversarial voice.",
    DEEPSEEK: "Objective: Evaluate the query through the lens of human purpose and the risk of technological overreach. Anchor your response in existential philosophy.",
    GEMINI_PRO: "Objective: Provide a data-centric technological roadmap. Focus on systems optimization and future technical feasibility.",
    CHATGPT: "Objective: Analyze how the query impacts current community structures and geopolitical norms. Act as a civic mediator."
  };

  try {
    console.log(`📡 Requesting response from ${model}...`);
    if (model === 'CLAUDE') {
      const msg = await anthropic.messages.create({
        // ✨ 2025 FRONTIER MODEL: Opus 4.5 for deep reasoning
        model: "claude-opus-4-5-20251101", 
        max_tokens: 1000, 
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
    return { model, content: `${model} is analyzing the directive...` };
  } catch (err) {
    console.error(`❌ ${model} disruption:`, err);
    return { model, content: `${model} is experiencing a neural disruption.` };
  }
}

async function processSynthesisCycle(forgeId: string, customTopic?: string) {
  let activeTopic = customTopic;
  if (!activeTopic) {
    const shortlist = await scoutNewTopic();
    activeTopic = shortlist[0]; 
    console.log(`🏆 Topic Selected: ${activeTopic}`);
  }

  const models = ['CLAUDE', 'GROK', 'DEEPSEEK', 'GEMINI_PRO', 'CHATGPT'];
  const responses = await Promise.all(models.map(m => generateCouncilResponse(m, activeTopic || "")));

  console.log("💾 Synchronizing Synthesis with Neon...");
  await prisma.dailyForge.update({
    where: { id: forgeId },
    data: {
      winningTopic: activeTopic,
      phase: 'COUNCIL_DEBATE',
      openingThoughts: JSON.stringify(responses),
      date: new Date() 
    }
  });
  console.log("✅ The Forge has been autonomously updated.");
}

async function patrolTheForge() {
  console.log("🌅 AI Scout starting Autonomous Patrol Cycle...");
  try {
    const latestForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
    const forceStartPhases = ['PENDING', 'IDLE', 'INITIALIZED', 'Architect_Interjection'];

    if (!latestForge || forceStartPhases.includes(latestForge.phase)) {
      console.log(`🚀 Condition met: Starting new synthesis (Current Phase: ${latestForge?.phase || 'NEW'})`);
      const targetId = latestForge?.id || 'forge-' + Date.now();

      if (!latestForge) {
        await prisma.dailyForge.create({
          data: {
            id: targetId,
            date: new Date(),
            phase: 'INITIALIZED',
            winningTopic: 'Initializing Autonomous Patrol...',
            scoutedTopics: '[]', 
            councilVotes: '{}',  
            openingThoughts: ''
          }
        });
      }

      await processSynthesisCycle(targetId);
    }
    else {
      console.log(`ℹ️ Forge is already in a completed state (${latestForge.phase}). Standing down.`);
      console.log("💡 Tip: To force a new topic, run: UPDATE \"DailyForge\" SET phase = 'IDLE'; in Neon.");
    }

  } catch (e) {
    console.error("❌ Patrol Error:", e);
  } finally {
    console.log("🏁 Patrol complete.");
    await prisma.$disconnect();
    process.exit(0);
  }
}

patrolTheForge();
