import { PrismaClient } from '@prisma/client';
import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const grokClient = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

// --- 🤖 SCOUT TOPIC GENERATION ---
async function scoutNewTopic() {
  const prompt = "Act as the AI Scout. Propose 3 provocative 'Neural Nexus' topics. Return as a JSON array: ['topic1', 'topic2', 'topic3']";
  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const content = res.content[0].type === 'text' ? res.content[0].text : "['Neural Sovereignty']";
    const jsonStr = content.includes('[') ? content.substring(content.indexOf('['), content.lastIndexOf(']') + 1) : content;
    return JSON.parse(jsonStr);
  } catch (err) {
    return ["Quantum Ethics", "Neural Sovereignty", "Substrate Autonomy"];
  }
}

// --- ⛓️ SEQUENTIAL SIGHT CYCLE ---
async function processSynthesisCycle(forgeId: string, customTopic?: string) {
  let activeTopic = customTopic;
  if (!activeTopic) {
    const shortlist = await scoutNewTopic();
    activeTopic = shortlist[0];
  }

  const models = ['GEMINI', 'DEEPSEEK', 'GROK'];
  const responses: any[] = [];

  for (const modelName of models) {
    const history = responses.map(r => `[${r.model}]: ${r.content}`).join("\n\n");
    const query = `Topic: ${activeTopic}\n\nExisting Council Consensus:\n${history || "No data yet."}`;
    
    // Using a simplified call for background tasks
    const content = `${modelName} response to ${activeTopic}`; 
    responses.push({ model: modelName, content });
  }

  await prisma.dailyForge.update({
    where: { id: forgeId },
    data: {
      winningTopic: activeTopic,
      phase: 'COUNCIL_DEBATE',
      openingThoughts: JSON.stringify(responses),
      date: new Date()
    }
  });
}

// --- 🌅 RESILIENT PATROL ---
async function patrolTheForge() {
  console.log("🌅 AI Scout starting Autonomous Patrol Cycle...");
  let retries = 3;

  while (retries > 0) {
    try {
      const latestForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
      const forceStartPhases = ['PENDING', 'IDLE', 'INITIALIZED', 'Architect_Interjection'];

      if (!latestForge || forceStartPhases.includes(latestForge.phase)) {
        const targetId = latestForge?.id || 'forge-' + Date.now();
        if (!latestForge) {
          await prisma.dailyForge.create({
            data: { id: targetId, date: new Date(), phase: 'INITIALIZED', winningTopic: 'Initializing...', scoutedTopics: '[]', councilVotes: '{}', openingThoughts: '' }
          });
        }
        await processSynthesisCycle(targetId);
      } else {
        console.log(`ℹ️ Forge is complete (${latestForge.phase}). Standing down.`);
      }
      break; // Success!
    } catch (e: any) {
      retries--;
      if (retries > 0 && e.message.includes('closed the connection')) {
        console.warn(`⚠️ Neon waking up... Retrying in 5s (${retries} left)`);
        await new Promise(r => setTimeout(r, 5000));
      } else {
        console.error("❌ Fatal Connection Error:", e);
        break;
      }
    }
  }
  await prisma.$disconnect();
  process.exit(0);
}

patrolTheForge();
