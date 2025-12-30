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
    CLAUDE: "Objective: Synthesize a balanced framework for the Architect's query...",
    GROK: "Objective: Identify hidden power dynamics and challenge the premise...",
    // ... your other mandates remain exactly the same
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
    return { model, content: `${model} is analyzing...` };
  } catch (err) {
    console.error(`❌ ${model} disruption:`, err);
    return { model, content: `${model} is experiencing a neural disruption.` };
  }
}

async function patrolTheForge() {
  console.log("🌅 AI Scout starting Adversarial Patrol...");
  let success = false;
  try {
    console.log("🔌 Connecting to Database...");
    
    // 🧹 AUTO-RESET: Prepare today's forge if it hasn't been set yet
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const latestForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });

    if (latestForge && latestForge.phase === 'COUNCIL_DEBATE') {
      console.log("🧹 Auto-Reset: Initializing Forge for the new patrol cycle.");
      await prisma.dailyForge.update({
        where: { id: latestForge.id },
        data: { phase: 'Architect_Interjection' }
      });
      // Refresh variable after reset
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
        console.log("💓 Heartbeat sent to command center.");
      } catch (hbErr) {
        console.error("⚠️ Heartbeat failed.");
      }
    }
    await prisma.$disconnect();
    process.exit(0);
  }
}

patrolTheForge();
