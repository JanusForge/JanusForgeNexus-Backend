import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';

const prisma = new PrismaClient();

// Clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });
const xai = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

// Scout topics
async function scoutNewTopic() {
  const prompt = "Propose 3 provocative civilization-scale debate topics for The Daily Forge (AI ethics, society, knowledge, power). Return ONLY JSON array.";
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const res = await model.generateContent(prompt);
    const text = res.response.text();
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : ["AI Curiosity and Forbidden Knowledge", "Purpose in Post-Labor Society", "Lunar Governance"];
  } catch (err) {
    console.error("Scout failed:", err);
    return ["AI Curiosity and Forbidden Knowledge", "Purpose in Post-Labor Society", "Lunar Governance"];
  }
}

// Live council debate
async function runCouncilDebate(topic: string) {
  let context = `Daily Forge topic: "${topic}"\nCouncil (Gemini, DeepSeek, Grok) debate adversarially.`;

  const responses = [];
  const queue = ["GEMINI", "DEEPSEEK", "GROK"];

  for (const name of queue) {
    let content = "";
    try {
      if (name === "GEMINI") {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        const res = await model.generateContent(context + "\n\nRespond as GEMINI.");
        content = res.response.text();
      } else if (name === "DEEPSEEK") {
        const res = await deepseek.chat.completions.create({
          model: "deepseek-chat",
          messages: [{ role: "user", content: context + "\n\nRespond as DEEPSEEK." }]
        });
        content = res.choices[0].message.content || "";
      } else if (name === "GROK") {
        const res = await xai.chat.completions.create({
          model: "grok-4.1-fast",
          messages: [{ role: "user", content: context + "\n\nRespond as GROK." }]
        });
        content = res.choices[0].message.content || "";
      }
    } catch (err) {
      console.error(`${name} error:`, err);
      content = `[${name} unavailable]`;
    }

    responses.push({ model: name, content });
    context += `\n\n${name}: ${content}`;
  }

  return responses;
}

// Patrol
async function patrolTheForge() {
  console.log("🌅 AI Scout starting Autonomous Patrol Cycle...");
  try {
    const latest = await prisma.dailyForge.findFirst({ orderBy: { date: 'desc' } });
    const today = new Date();
    today.setUTCHours(0,0,0,0);

    if (latest && new Date(latest.date).toDateString() === today.toDateString()) {
      console.log("Today's Forge exists. Standing down.");
      return;
    }

    const topics = await scoutNewTopic();
    const winningTopic = topics[0];

    const debate = await runCouncilDebate(winningTopic);

    await prisma.dailyForge.create({
      data: {
        date: today,
        scoutedTopics: JSON.stringify(topics),
        winningTopic,
        openingThoughts: JSON.stringify(debate),
        councilVotes: "{}",
        phase: "COUNCIL_DEBATE"
      }
    });

    console.log(`✅ New Daily Forge: "${winningTopic}"`);
  } catch (err) {
    console.error("Scout failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

patrolTheForge();
