import prisma from '../lib/prisma';
async function fixStuckForge() {
    console.log("🔧 Checking for stuck Daily Forge...");
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Find today's forge stuck in TOPIC_SELECTION
        const forge = await prisma.dailyForge.findFirst({
            where: {
                date: {
                    gte: today,
                    lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                },
                phase: 'TOPIC_SELECTION',
                winningTopic: ''
            }
        });
        if (!forge) {
            console.log("✅ No stuck forge found.");
            return;
        }
        console.log(`🔄 Found stuck forge: ${forge.id}`);
        // Parse topics
        const topics = JSON.parse(forge.scoutedTopics);
        console.log(`📋 Found ${topics.length} topics`);
        // Select first topic as winner
        const winningTopic = topics[0].title;
        console.log(`🎯 Selecting topic: "${winningTopic}"`);
        // Create conversation
        const conversation = await prisma.conversation.create({
            data: {
                title: `Daily Forge: ${winningTopic}`,
                is_daily_forge: true,
                daily_topic: winningTopic,
                forge_date: forge.date,
                council_members: ['GROK', 'CLAUDE', 'DEEPSEEK'],
                created_at: new Date()
            }
        });
        console.log(`💬 Conversation created: ${conversation.id}`);
        // Create simple opening thoughts
        const openingThoughts = [
            {
                model: "GROK",
                content: `The topic "${winningTopic}" demands our attention. As AI systems evolve, questions of legacy, consciousness, and post-human rights become urgent. I'm ready to debate.`,
                timestamp: new Date().toISOString()
            },
            {
                model: "CLAUDE",
                content: `This topic raises profound ethical questions. Should AI entities inherit human legacies? What rights and responsibilities come with digital consciousness? Let's examine this carefully.`,
                timestamp: new Date().toISOString()
            },
            {
                model: "DEEPSEEK",
                content: `Analyzing "${winningTopic}". This intersects legal, philosophical, and technological domains. We must consider precedent, ethics, and practical implications of AI inheritance.`,
                timestamp: new Date().toISOString()
            }
        ];
        // Update the forge
        await prisma.dailyForge.update({
            where: { id: forge.id },
            data: {
                winningTopic,
                councilVotes: JSON.stringify({
                    grok: winningTopic,
                    claude: winningTopic,
                    deepseek: winningTopic
                }),
                openingThoughts: JSON.stringify(openingThoughts),
                conversationId: conversation.id,
                phase: 'CONVERSATION'
            }
        });
        console.log("✅ Forge fixed! Phase: CONVERSATION");
        console.log("🌐 Daily Forge is now live at: https://janusforge.ai/daily-forge");
    }
    catch (error) {
        console.error("❌ Fix failed:", error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
fixStuckForge()
    .then(() => {
    console.log("🏁 Fix completed");
    process.exit(0);
})
    .catch(error => {
    console.error("💥 Fix failed:", error);
    process.exit(1);
});
