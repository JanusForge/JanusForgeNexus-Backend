import prisma from './lib/prisma';
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function runDailyForge() {
    console.log("🔭 Scout initiating daily sweep...");
    try {
        // 1. The Scout identifies today's dilemma
        const topic = "Neural Ethics: The Balance of Power in 2026";
        const scoutQuote = "The Council is playing it safe. These neural guardrails are actually throttling creativity.";
        // 2. The Council debates (Simulated for the summary)
        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "system", content: "You are the Janus Forge Council. Summarize the daily debate on: " + topic }],
        });
        const councilVerdict = completion.choices[0].message.content;
        // 3. Atomic Update in Neon
        await prisma.dailyForge.create({
            data: {
                date: new Date(),
                scoutedTopics: JSON.stringify([topic]),
                winningTopic: topic,
                councilVotes: scoutQuote,
                openingThoughts: councilVerdict,
                phase: "COMPLETED"
            }
        });
        console.log("✅ Daily Forge successfully updated in Neon.");
    }
    catch (error) {
        console.error("❌ Scout Failed:", error);
    }
    finally {
        await prisma.$disconnect();
    }
}
runDailyForge();
