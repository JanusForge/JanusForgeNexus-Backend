const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected via Prisma');
    
    const tiers = await prisma.tierConfiguration.findMany();
    console.log(`📊 Found ${tiers.length} tier configurations:`);
    tiers.forEach(tier => {
      console.log(`   • ${tier.tier}: ${tier.aiModels.length} AI models, ${tier.tokenAllowance} tokens`);
    });
    
    const users = await prisma.user.count();
    console.log(`👤 Total users: ${users}`);
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
