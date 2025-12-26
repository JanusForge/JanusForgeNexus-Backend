import { PrismaClient } from '@prisma/client';
import { TIER_CONFIGURATIONS } from './src/services/tierService';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');
  
  // Create tier configurations
  for (const [key, config] of Object.entries(TIER_CONFIGURATIONS)) {
    await prisma.tierConfiguration.upsert({
      where: { tier: config.tier },
      update: config,
      create: config
    });
    console.log(`   ✅ ${config.tier} tier configured`);
  }
  
  // Create a test conversation
  const testConversation = await prisma.conversation.upsert({
    where: { id: 'test-conversation-1' },
    update: {},
    create: {
      id: 'test-conversation-1',
      title: 'Welcome to Janus Forge Nexus!',
      isDailyForge: false
    }
  });
  
  console.log('   ✅ Test conversation created');
  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
