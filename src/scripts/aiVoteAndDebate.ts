// src/scripts/aiVoteAndDebate.ts - New minimal script
// Purpose: Automates voting on scouted topics + generates exact 3-post initial debate
// Run this on Render cron ~5-10 minutes after aiScout (e.g., 05:10 UTC daily)
// Keeps your 3 council AIs only, randomizes debate order (who starts), concise responses
import prisma from '../lib/prisma';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
import { AIParticipant } from '@prisma/client'; // Ensure imported for enum refs

// Clients - latest models as of January 2026
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com"
});
const xai = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1'
});

// EST-aware date calculation for today/tomorrow (midnight EST in UTC)
const now = new Date();
const estOffset = -5 * 60 * 60 * 1000; // EST = UTC-5 (standard time)
const estNow = new Date(now.getTime() + estOffset);
estNow.setUTCHours(0, 0, 0, 0); // Midnight EST
const todayUTCStart = new Date(estNow.getTime() - estOffset);
const tomorrowUTCStart = new Date(todayUTCStart.getTime() + 24 * 60 * 60 * 1000);

// Your fixed 3 council AIs - FIXED: Use exact enum names (GEMINI → GEMINI_PRO)
const councilAIs = [
  { name: 'DEEPSEEK', client: deepseek, model: 'deepseek-chat', enum: AIParticipant.DEEPSEEK },
  { name: 'GROK', client: xai, model: 'grok-4', enum: AIParticipant.GROK },
  { name: 'GEMINI', client: genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' }), enum: AIParticipant.GEMINI_PRO }
];

async function callAI(ai: any, prompt: string): Promise<string> {
  try {
    if (ai.name === 'GEMINI') {
      const res = await ai.client.generateContent(prompt);
      return res.response.text().trim();
    } else {
      const res = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100, // Enforce concise votes
        temperature: 0.7
      });
      return res.choices[0].message.content?.trim() || "";
    }
  } catch (error) {
    console.error(`${ai.name} call failed:`, error);
    return "[Unavailable]";
  }
}

// NEW EXPORT: Run council vote
export async function runCouncilVote(forgeId: string): Promise<Record<string, string>> {
  console.log('🗳️ Running council vote for forge:', forgeId);
  const current = await prisma.dailyForge.findUnique({ where: { id: forgeId } });
  if (!current || !current.scoutedTopics) throw new Error('No forge or topics');
  const topics = JSON.parse(current.scoutedTopics);
  if (topics.length === 0) throw new Error('No topics found');
  const votePrompt = `Here are today's 3 proposed topics (JSON format):\n${JSON.stringify(topics, null, 2)}\n\nVote for exactly ONE by responding ONLY with its exact "title". Choose the most provocative and civilization-scale worthy of debate.`;
  const votes: Record<string, string> = {};
  for (const ai of councilAIs) {
    const vote = await callAI(ai, votePrompt);
    votes[ai.name.toLowerCase()] = vote;
    console.log(`${ai.name} voted: ${vote}`);
  }
  return votes;
}

// NEW EXPORT: Tally votes to find winner
export function tallyVotes(votes: Record<string, string>): string {
  const voteCounts: Record<string, number> = {};
  Object.values(votes).forEach(v => {
    voteCounts[v] = (voteCounts[v] || 0) + 1;
  });
  const winningTitle = Object.keys(voteCounts).sort((a, b) => voteCounts[b] - voteCounts[a] || Math.random() - 0.5)[0];
  if (!winningTitle) throw new Error('No clear winner');
  return winningTitle;
}

// NEW EXPORT: Run initial 3-post debate
export async function runInitialDebate(winningTopic: string): Promise<Array<{ model: string; content: string }>> {
  console.log('🗣️ Running initial debate on:', winningTopic);
  // Create conversation
  const conversation = await prisma.conversation.create({
    data: {
      title: winningTopic,
      is_daily_forge: true
    }
  });
  // Randomize debate order
  const debateOrder = [...councilAIs].sort(() => Math.random() - 0.5);
  console.log(`Debate order: ${debateOrder.map(a => a.name).join(' → ')}`);
  const openingThoughts: Array<{ model: string; content: string }> = [];
  let transcript = `Topic: ${winningTopic}\n\n`;
  for (let i = 0; i < debateOrder.length; i++) {
    const ai = debateOrder[i];
    const isFirst = i === 0;
    const prompt = isFirst
      ? `Start a provocative, concise debate (300-500 words max) on: "${winningTopic}". Be substantive, bold, and true to your unique perspective.`
      : `Respond directly to the previous points in this debate transcript. Keep concise (300-500 words max), add new insight, stay on topic.\n\nTranscript so far:\n${transcript}`;
    const content = await callAI(ai, prompt);
    if (content && content !== "[Unavailable]") {
      // Save post to conversation - FIXED: Use direct enum reference from councilAIs
      await prisma.post.create({
        data: {
          content,
          is_human: false,
          ai_model: ai.enum, // Use the pre-mapped enum value
          conversation_id: conversation.id
        }
      });
      openingThoughts.push({ model: ai.name, content });
      transcript += `${ai.name}: ${content}\n\n`;
      console.log(`${ai.name} contributed to initial debate.`);
    }
  }
  return openingThoughts;
}

// Main cron entrypoint - runs the full cycle
(async () => {
  try {
    console.log('🗳️🔥 AI Council Voting & Initial Debate Cycle Starting...');
    const current = await prisma.dailyForge.findFirst({
      where: {
        date: { gte: todayUTCStart, lt: tomorrowUTCStart },
        phase: 'TOPIC_SELECTION'
      }
    });
    if (!current || !current.scoutedTopics) {
      console.log('No forge in TOPIC_SELECTION or no topics. Standing down.');
      process.exit(0);
    }
    const topics = JSON.parse(current.scoutedTopics);
    if (topics.length === 0) {
      console.log('No scouted topics found.');
      process.exit(0);
    }
    console.log(`📋 ${topics.length} topics available for voting.`);
    // Step 1: Run vote
    const votes = await runCouncilVote(current.id);
    const winningTopic = tallyVotes(votes);
    console.log(`🏆 Winning topic: ${winningTopic}`);
    // Step 2: Run initial debate
    const openingThoughts = await runInitialDebate(winningTopic);
    // Step 3: Create conversation and update forge
    const conversation = await prisma.conversation.create({
      data: { title: winningTopic, is_daily_forge: true }
    });
    await prisma.dailyForge.update({
      where: { id: current.id },
      data: {
        winningTopic,
        councilVotes: JSON.stringify(votes),
        openingThoughts: JSON.stringify(openingThoughts),
        conversationId: conversation.id,
        phase: 'CONVERSATION'
      }
    });
    console.log('✅ Daily Forge advanced: Voting complete, initial 3-post debate generated, interjections now open!');
    console.log('🏁 Vote & Debate cycle completed');
    process.exit(0);
  } catch (error) {
    console.error('💥 Cycle failed:', error);
    process.exit(1);
  }
})();

// TEMP DISABLED - old broken call (causes startup crash on import)
// voteAndDebate()
//   .then(() => {
//     console.log('🏁 Vote & Debate cycle completed');
//     process.exit(0);
//   })
//   .catch(error => {
//     console.error('💥 Cycle failed:', error);
//     process.exit(1);
//   });
