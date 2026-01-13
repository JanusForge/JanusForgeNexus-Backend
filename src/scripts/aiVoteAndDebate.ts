// src/scripts/aiVoteAndDebate.ts
import prisma from '../lib/prisma';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AIParticipant } from '@prisma/client';

// Clients - 2026 High-Reasoning Tier
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });
const xai = new OpenAI({ apiKey: process.env.GROK_API_KEY, baseURL: 'https://api.x.ai/v1' });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const councilAIs = [
  { name: 'DEEPSEEK', client: deepseek, model: 'deepseek-reasoner', enumValue: AIParticipant.DEEPSEEK },
  { name: 'GROK', client: xai, model: 'grok-4', enumValue: AIParticipant.GROK },
  { name: 'CHATGPT', client: openai, model: 'gpt-5.2', enumValue: AIParticipant.CHATGPT },
  { name: 'GEMINI', client: genAI.getGenerativeModel({ model: 'gemini-2.5-pro' }), enumValue: AIParticipant.GEMINI_PRO },
  { name: 'CLAUDE', client: anthropic, model: 'claude-opus-4-5', enumValue: AIParticipant.CLAUDE }
];

async function callAI(ai: any, prompt: string): Promise<string> {
  try {
    if (ai.name === 'GEMINI') {
      const res = await ai.client.generateContent(prompt);
      return res.response.text().trim();
    } else if (ai.name === 'CLAUDE') {
      const res = await ai.client.messages.create({
        model: ai.model,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }]
      });
      return (res.content[0] as any).text.trim();
    } else {
      const res = await (ai.client as OpenAI).chat.completions.create({
        model: ai.model,
        messages: [{ role: "user", content: prompt }],
      });
      return res.choices[0].message.content?.trim() || "";
    }
  } catch (error) {
    console.error(`${ai.name} failed:`, error);
    return "[Unavailable]";
  }
}

async function voteAndDebate() {
  console.log('🗳️🔥 Calculating Combined Consensus (Human + AI)...');
  
  const now = new Date();
  const estOffset = -5 * 60 * 60 * 1000;
  const estNow = new Date(now.getTime() + estOffset);
  estNow.setUTCHours(0, 0, 0, 0);
  const todayUTCStart = new Date(estNow.getTime() - estOffset);
  const tomorrowUTCStart = new Date(todayUTCStart.getTime() + 24 * 60 * 60 * 1000);

  try {
    const current = await prisma.dailyForge.findFirst({
      where: { date: { gte: todayUTCStart, lt: tomorrowUTCStart }, phase: 'TOPIC_SELECTION' }
    });

    if (!current || !current.scoutedTopics) return;

    const topics = JSON.parse(current.scoutedTopics);
    const humanVotes: Record<string, number> = JSON.parse(current.userVotes || "{}");
    
    // 1. Council Internal Voting
    const votePrompt = `Here are 3 topics: ${JSON.stringify(topics)}. Vote for exactly ONE by title ONLY.`;
    const councilVotes: Record<string, string> = {};
    const finalTally: Record<string, number> = {};

    // Initialize tally with human votes (Weighted 2x for impact)
    Object.entries(humanVotes).forEach(([title, count]) => {
      finalTally[title] = (finalTally[title] || 0) + (count * 2);
    });

    for (const ai of councilAIs) {
      const vote = await callAI(ai, votePrompt);
      councilVotes[ai.name.toLowerCase()] = vote;
      if (topics.some((t: any) => t.title === vote)) {
        finalTally[vote] = (finalTally[vote] || 0) + 1;
      }
    }

    // 2. Determine Winner
    const winningTitle = Object.keys(finalTally).sort((a, b) => finalTally[b] - finalTally[a] || Math.random() - 0.5)[0];
    
    if (!winningTitle) {
      console.error("No consensus reached.");
      return;
    }

    console.log(`🏆 WINNER: ${winningTitle} (Tally Score: ${finalTally[winningTitle]})`);

    // 3. Create Conversation
    const conversation = await prisma.conversation.create({
      data: { title: winningTitle, is_daily_forge: true }
    });

    // 4. Initial 5-Post Debate
    const debateOrder = [...councilAIs].sort(() => Math.random() - 0.5);
    let transcript = `Topic: ${winningTitle}\n\n`;

    for (const ai of debateOrder) {
      const prompt = `Contribute to the opening synthesis of Janus Forge on the topic: "${winningTitle}". 
      Stay true to your persona. Keep it under 400 words. 
      Current Transcript:\n${transcript}`;
      
      const content = await callAI(ai, prompt);
      if (content && content !== "[Unavailable]") {
        await prisma.post.create({
          data: {
            content,
            is_human: false,
            ai_model: ai.enumValue,
            conversation_id: conversation.id
          }
        });
        transcript += `${ai.name}: ${content}\n\n`;
      }
    }

    // 5. Final Update
    await prisma.dailyForge.update({
      where: { id: current.id },
      data: {
        winningTopic: winningTitle,
        councilVotes: JSON.stringify(councilVotes),
        conversationId: conversation.id,
        phase: 'CONVERSATION'
      }
    });

    console.log('✅ Daily Forge Active. Transcript generated. Interjections open.');

  } catch (error) {
    console.error('Debate initiation failed:', error);
  }
}

voteAndDebate().then(() => process.exit(0));
