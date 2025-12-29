import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Nexus Core Seeding...');

  // 1. Create the Admin User directly
  const admin = await prisma.user.upsert({
    where: { username: 'admin-access' },
    update: {
      token_balance: 999999,
      tier: 'enterprise'
    },
    create: {
      username: 'admin-access',
      email: 'admin@janusforge.ai',
      password_hash: 'nexus-admin-bypass', 
      token_balance: 999999,
      tier: 'enterprise'
    },
  });

  console.log(`✅ Admin Created: ${admin.username} (ID: ${admin.id})`);
  console.log(`💎 Balance Set: ${admin.token_balance} tokens`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
