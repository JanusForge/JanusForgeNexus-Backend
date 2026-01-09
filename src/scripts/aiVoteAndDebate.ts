// src/scripts/aiVoteAndDebate.ts - New minimal script
// Purpose: Automates voting on scouted topics + generates exact 3-post initial debate
// Run this on Render cron ~5-10 minutes after aiScout (e.g., 05:10 UTC daily)
// Keeps your 3 council AIs only, randomizes debate order (who starts), concise responses

import prisma from '../lib/prisma';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';

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

// Your fixed 3 council AIs
const councilAIs = [
  { name: 'DEEPSEEK', client: deepseek, model: 'deepseek-chat' },
  { name: 'GROK', client: xai, model: 'grok-4' },           // Current flagship per xAI API/docs
  { name: 'GEMINI', client: genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' }) } // High-capability latest stable
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

async function voteAndDebate() {
  console.log('🗳️🔥 AI Council Voting & Initial Debate Cycle Starting...');

  // EST-aware date (copy logic from updated aiScout.ts)
  const now = new Date();
  const estOffset = -5 * 60 * 60 * 1000;
  const estNow = new Date(now.getTime() + estOffset);
  estNow.setUTCHours(0, 0, 0, 0);
  const todayUTCStart = new Date(estNow.getTime() - estOffset);
  const tomorrowUTCStart = new Date(todayUTCStart.getTime() + 24 * 60 * 60 * 1000);

  try {
    const current = await prisma.dailyForge.findFirst({
      where: {
        date: { gte: todayUTCStart, lt: tomorrowUTCStart },
        phase: 'TOPIC_SELECTION'
      }
    });

    if (!current || !current.scoutedTopics) {
      console.log('No forge in TOPIC_SELECTION or no topics. Standing down.');
      return;
    }

    const topics = JSON.parse(current.scoutedTopics);
    if (topics.length === 0) {
      console.log('No scouted topics found.');
      return;
    }

    console.log(`📋 ${topics.length} topics available for voting.`);

    // Voting phase
    const votePrompt = `Here are today's 3 proposed topics (JSON format):\n${JSON.stringify(topics, null, 2)}\n\nVote for exactly ONE by responding ONLY with its exact "title". Choose the most provocative and civilization-scale worthy of debate.`;
    
    const votes: Record<string, string> = {};
    for (const ai of councilAIs) {
      const vote = await callAI(ai, votePrompt);
      votes[ai.name.toLowerCase()] = vote;
      console.log(`${ai.name} voted: ${vote}`);
    }

    // Tally winner (most votes; random tiebreak)
    const voteCounts: Record<string, number> = {};
    Object.values(votes).forEach(v => {
      if (topics.some((t: any) => t.title === v)) voteCounts[v] = (voteCounts[v] || 0) + 1;
    });
    const winningTitle = Object.keys(voteCounts).sort((a, b) => voteCounts[b] - voteCounts[a] || Math.random() - 0.5)[0];

    if (!winningTitle) {
      console.log('No clear winner. Standing down.');
      return;
    }

    console.log(`🏆 Winning topic: ${winningTitle}`);

    // Create conversation for debate
    const conversation = await prisma.conversation.create({
      data: {
        title: winningTitle,
        is_daily_forge: true
      }
    });

    // Randomize debate order (who starts)
    const debateOrder = [...councilAIs].sort(() => Math.random() - 0.5);
    console.log(`🗣️ Debate order: ${debateOrder.map(a => a.name).join(' → ')}`);

    const openingThoughts: Array<{ model: string; content: string }> = [];
    let transcript = `Topic: ${winningTitle}\n\n`;

    for (let i = 0; i < debateOrder.length; i++) {
      const ai = debateOrder[i];
      const isFirst = i === 0;
      const prompt = isFirst
        ? `Start a provocative, concise debate (300-500 words max) on: "${winningTitle}". Be substantive, bold, and true to your unique perspective.`
        : `Respond directly to the previous points in this debate transcript. Keep concise (300-500 words max), add new insight, stay on topic.\n\nTranscript so far:\n${transcript}`;

      const content = await callAI(ai, prompt);
      if (content && content !== "[Unavailable]") {
        // Save post to conversation (AI post)
        await prisma.post.create({
          data: {
            content,
            is_human: false,
            ai_model: ai.name,
            conversation_id: conversation.id
          }
        });

        openingThoughts.push({ model: ai.name, content });
        transcript += `${ai.name}: ${content}\n\n`;
        console.log(`${ai.name} contributed to initial debate.`);
      }
    }

    // Update dailyForge
    await prisma.dailyForge.update({
      where: { id: current.id },
      data: {
        winningTopic: winningTitle,
        councilVotes: JSON.stringify(votes),
        openingThoughts: JSON.stringify(openingThoughts),
        conversationId: conversation.id,
        phase: 'CONVERSATION'
      }
    });

    console.log('✅ Daily Forge advanced: Voting complete, initial 3-post debate generated, interjections now open!');
  } catch (error) {
    console.error('Vote & Debate cycle failed:', error);
  }
}

// Run
voteAndDebate()
  .then(() => {
    console.log('🏁 Vote & Debate cycle completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Cycle failed:', error);
    process.exit(1);
  });
