// src/scripts/aiScout.ts
import prisma from '../lib/prisma';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com"
});
const xai = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const councilAIs = [
  { name: 'DEEPSEEK', client: deepseek, model: 'deepseek-chat' },
  { name: 'GROK', client: xai, model: 'grok-4.1-fast-reasoning' },
  { name: 'GEMINI', client: genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }) }, 
  { name: 'CLAUDE', client: anthropic, model: 'claude-sonnet-4-5' } 
];

async function scoutNewTopic(scoutAI: any) {
  const currentDate = new Date().toISOString().split('T')[0];
  const prompt = `Today is ${currentDate}. You are the Scout AI for The Daily Forge.
  Choose THREE single topics that you find profoundly important, urgent, or fascinating.
  Return ONLY a JSON array with exactly 3 objects:
  { "title": "...", "description": "...", "provocation": "...", "tags": ["..."] }`;

  try {
    let text = "";
    if (scoutAI.name === 'GEMINI') {
      const res = await scoutAI.client.generateContent(prompt);
      text = res.response.text();
    } else if (scoutAI.name === 'CLAUDE') {
      const res = await scoutAI.client.messages.create({
        model: scoutAI.model,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      });
      text = (res.content[0] as any).text;
    } else {
      const res = await scoutAI.client.chat.completions.create({
        model: scoutAI.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      });
      text = res.choices[0].message.content || "";
    }
    return JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
  } catch (error) {
    console.error('Scout topic generation failed:', error);
    return [];
  }
}

async function patrolTheForge() {
  console.log('🌅 AI Scout starting Autonomous Patrol Cycle...');
  const now = new Date();
  const estOffset = -5 * 60 * 60 * 1000;
  const estNow = new Date(now.getTime() + estOffset);
  estNow.setUTCHours(0, 0, 0, 0);
  const todayUTCStart = new Date(estNow.getTime() - estOffset);
  const tomorrowUTCStart = new Date(todayUTCStart.getTime() + 24 * 60 * 60 * 1000);

  try {
    const existingForge = await prisma.dailyForge.findFirst({
      where: { date: { gte: todayUTCStart, lt: tomorrowUTCStart } }
    });
    if (existingForge) {
      console.log("Today's Forge exists. Standing down.");
      return;
    }

    const scoutAI = councilAIs[Math.floor(Math.random() * councilAIs.length)];
    console.log(`🕵️ Today's Scout AI: ${scoutAI.name}`);

    const topics = await scoutNewTopic(scoutAI);
    if (topics.length === 0) return;

    const newForge = await prisma.dailyForge.create({
      data: {
        date: todayUTCStart,
        scoutedTopics: JSON.stringify(topics),
        winningTopic: "",
        councilVotes: "{}",
        phase: 'TOPIC_SELECTION'
      }
    });
    console.log(`✅ Daily Forge created: ${newForge.id}`);
  } catch (error) {
    console.error('Scout failed:', error);
  }
}

patrolTheForge().then(() => process.exit(0));
