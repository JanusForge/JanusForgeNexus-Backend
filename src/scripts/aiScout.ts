import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });
const xai = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

// --- 🤖 SCOUT TOPIC GENERATION ---
async function scoutNewTopic() {
  const prompt = "Act as the AI Scout for The Daily Forge. Propose 3 provocative, civilization-scale topics that would spark deep debate among AIs and humans. Focus on ethics, future society, AI rights, knowledge, power, or existential risk. Return ONLY a JSON array of 3 strings.";
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const res = await model.generateContent(prompt);
    const content = res.response.text();
    const jsonMatch = content.match(/\[.*\]/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return ["AI Curiosity and Forbidden Knowledge", "Purpose in a Post-Labor World", "Lunar Resource Governance"];
  } catch (err) {
    console.error("Scout failed:", err);
    return ["AI Curiosity and Forbidden Knowledge", "Purpose in a Post-Labor World", "Lunar Resource Governance"];
  }
}

// --- ⛓️ LIVE COUNCIL DEBATE ON WINNING TOPIC ---
async function runCouncilDebate(topic: string) {
  let context = `The Daily Forge topic today is: "${topic}"\n\nThe council (Gemini, DeepSeek, Grok) will now debate this topic adversarially.`;

  const responses = [];

  const councilQueue = [
    { name: "GEMINI", model: "gemini-1.5-flash" },
    { name: "DEEPSEEK", model: "deepseek-chat" },
    { name: "GROK", model: "grok-beta" }
  ];

  for (const ai of councilQueue) {
    let aiContent = "";
    try {
      if (ai.name === "GEMINI") {
        const model = genAI.getGenerativeModel({ model: ai.model });
        const res = await model.generateContent(context + `\n\nRespond as GEMINI with your perspective.`);
        aiContent = res.response.text();
      } else if (ai.name === "DEEPSEEK") {
        const res = await deepseek.chat.completions.create({
          model: ai.model,
          messages: [{ role: "user", content: context + `\n\nRespond as DEEPSEEK.` }]
        });
        aiContent = res.choices[0].message.content || "";
      } else if (ai.name === "GROK") {
        const res = await xai.chat.completions.create({
          model: ai.model,
          messages: [{ role: "user", content: context + `\n\nRespond as GROK.` }]
        });
        aiContent = res.choices[0].message.content || "";
      }
    } catch (err) {
      console.error(`${ai.name} failed:`, err);
      aiContent = `[${ai.name} temporarily unavailable]`;
    }

    responses.push({ model: ai.name, content: aiContent });
    context += `\n\n${ai.name}: ${aiContent}`;
  }

  return responses;
}

// --- 🌅 RESILIENT PATROL ---
async function patrolTheForge() {
  console.log("🌅 AI Scout starting Autonomous Patrol Cycle...");

  try {
    const latestForge = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    if (latestForge && new Date(latestForge.date).toDateString() === today.toDateString()) {
      console.log(`ℹ️ Today's Forge already exists. Standing down.`);
      return;
    }

    console.log("🆕 Creating new Daily Forge for today...");

    const topics = await scoutNewTopic();
    const winningTopic = topics[0]; // Or implement voting logic later

    const councilDebate = await runCouncilDebate(winningTopic);

    await prisma.dailyForge.create({
      data: {
        date: today,
        scoutedTopics: JSON.stringify(topics),
        winningTopic,
        openingThoughts: JSON.stringify(councilDebate),
        councilVotes: JSON.stringify({}), // Placeholder for future voting
        phase: 'COUNCIL_DEBATE'
      }
    });

    console.log(`✅ Daily Forge created: "${winningTopic}"`);
    console.log("Council debate complete.");
  } catch (error) {
    console.error("Scout patrol failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

patrolTheForge();
