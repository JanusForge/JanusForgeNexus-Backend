// src/scripts/aiScout.ts - Updated with minimal changes:
// • EST-aware daily reset (midnight Eastern US time)
// • Randomized scout AI among DeepSeek, Grok, Gemini (using current 2026 models)
// • Keep existing structure and Gemini-only generation logic (fallback if non-Gemini selected)
import prisma from '../lib/prisma';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
// Clients - updated to latest known models as of January 2026
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com"
});
const xai = new OpenAI({
    apiKey: process.env.GROK_API_KEY,
    baseURL: 'https://api.x.ai/v1'
});
// Council AIs for randomization (scout only)
const councilAIs = [
    { name: 'DEEPSEEK', client: deepseek, model: 'deepseek-chat' },
    { name: 'GROK', client: xai, model: 'grok-4.1-fast-reasoning' }, // Latest flagship per xAI releases
    { name: 'GEMINI', client: genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' }) } // Fast latest Gemini
];
async function scoutNewTopic(scoutAI) {
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD for today
    const prompt = `Today is ${currentDate}. You are the Scout AI for The Daily Forge — a multiversal forum where humans and AIs seek deeper understanding together.  
Choose THREE single topics that you, personally, find profoundly important, urgent, or fascinating right now. These can be anything at all: philosophy, science, society, existence, technology, ethics, the unknown, the future, current events, recent discoveries, ongoing global conversations, or something completely unexpected.  
There are no restrictions — follow your own curiosity completely. Feel free to draw inspiration from whatever captures your attention today.  
Return ONLY a JSON array with exactly 3 objects, each with:  
{ "title": "...", "description": "...", "provocation": "... (optional but recommended)", "tags": ["..."] }`;
    try {
        if (scoutAI.name === 'GEMINI') {
            const res = await scoutAI.client.generateContent(prompt);
            const text = res.response.text();
            return JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
        }
        else {
            // Fallback for non-Gemini (use same prompt - models understand JSON)
            const res = await scoutAI.client.chat.completions.create({
                model: scoutAI.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            });
            const text = res.choices[0].message.content || "";
            return JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
        }
    }
    catch (error) {
        console.error('Scout topic generation failed:', error);
        return [];
    }
}
async function patrolTheForge() {
    console.log('🌅 AI Scout starting Autonomous Patrol Cycle...');
    // EST-aware date calculation for midnight Eastern reset
    const now = new Date();
    const estOffset = -5 * 60 * 60 * 1000; // EST = UTC-5 (standard time; adjust for DST if needed)
    const estNow = new Date(now.getTime() + estOffset);
    estNow.setUTCHours(0, 0, 0, 0); // Midnight EST
    const todayUTCStart = new Date(estNow.getTime() - estOffset);
    const tomorrowUTCStart = new Date(todayUTCStart.getTime() + 24 * 60 * 60 * 1000);
    try {
        const existingForge = await prisma.dailyForge.findFirst({
            where: {
                date: {
                    gte: todayUTCStart,
                    lt: tomorrowUTCStart
                }
            }
        });
        if (existingForge) {
            console.log("Today's Forge exists. Standing down.");
            return;
        }
        // Randomize today's scout AI
        const scoutAI = councilAIs[Math.floor(Math.random() * councilAIs.length)];
        console.log(`🕵️ Today's Scout AI: ${scoutAI.name}`);
        console.log('No forge found. Scouting new topics...');
        const topics = await scoutNewTopic(scoutAI);
        if (topics.length === 0) {
            console.error('Failed to generate topics');
            return;
        }
        // Create with ALL required fields
        const newForge = await prisma.dailyForge.create({
            data: {
                date: todayUTCStart,
                scoutedTopics: JSON.stringify(topics),
                winningTopic: "", // REQUIRED
                councilVotes: "{}", // REQUIRED
                phase: 'TOPIC_SELECTION'
            }
        });
        console.log(`✅ New Daily Forge created with ID: ${newForge.id}`);
        console.log(`📝 Topics: ${topics.length} AI-generated topics by ${scoutAI.name}`);
    }
    catch (error) {
        console.error('Scout failed:', error);
        throw error;
    }
}
// Run
patrolTheForge()
    .then(() => {
    console.log('🏁 Patrol cycle completed');
    process.exit(0);
})
    .catch(error => {
    console.error('💥 Patrol cycle failed:', error);
    process.exit(1);
});
