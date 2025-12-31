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
// This function replaces the "Waiting for Architect" step
async function scoutNewTopic() {
  console.log("🔍 Scouting the datasphere for fresh intelligence...");
  
  // Directly query the high-logic models for a shortlist of 3 topics
  const prompt = "Act as the AI Scout. Propose 3 provocative, high-tension 'Neural Nexus' topics for today's debate. Each should be under 10 words. Return as a JSON array: ['topic1', 'topic2', 'topic3']";
  
  try {
    const res = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    
    const content = res.content[0].type === 'text' ? res.content[0].text : "['Neural Sovereignty']";
    return JSON.parse(content);
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
    // Logic for Claude and Grok (same as previous)
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
  const forge = await prisma.dailyForge.findUnique({ where: { id: forgeId } });
  
  // 1. Autonomous Topic Selection
  let activeTopic = customTopic;
  if (!activeTopic) {
    const shortlist = await scoutNewTopic();
    activeTopic = shortlist[0]; // Choose the top scouted topic
    console.log(`🏆 Topic Selected: ${activeTopic}`);
  }

  // 2. Full Council Debate
  const models = ['CLAUDE', 'GROK', 'DEEPSEEK', 'GEMINI_PRO', 'CHATGPT'];
  const responses = await Promise.all(models.map(m => generateCouncilResponse(m, activeTopic || "")));

  console.log("💾 Synchronizing Synthesis with Neon...");
  await prisma.dailyForge.update({
    where: { id: forgeId },
    data: {
      winningTopic: activeTopic,
      phase: 'COUNCIL_DEBATE',
      openingThoughts: JSON.stringify(responses),
      date: new Date() // Forces the date to 'Now' for the homepage sort
    }
  });
  console.log("✅ The Forge has been autonomously updated.");
}

async function patrolTheForge() {
  console.log("🌅 AI Scout starting Autonomous Patrol Cycle...");
  try {
    const latestForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });

    // 🔄 TRIGGER LOGIC: Run if Forge is PENDING, IDLE, INITIALIZED, or if forced.
    const forceStartPhases = ['PENDING', 'IDLE', 'INITIALIZED', 'Architect_Interjection'];
    
    if (!latestForge || forceStartPhases.includes(latestForge.phase)) {
      console.log(`🚀 Condition met: Starting new synthesis (Current Phase: ${latestForge?.phase || 'NEW'})`);
      const targetId = latestForge?.id || 'forge-' + Date.now();
      
      // If no record, create one
      if (!latestForge) {
        await prisma.dailyForge.create({ data: { id: targetId, date: new Date(), phase: 'INITIALIZED' } });
      }

      await processSynthesisCycle(targetId);
    } 
    else {
      console.log(`ℹ️ Forge is already in a completed state (${latestForge.phase}). Standing down.`);
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
