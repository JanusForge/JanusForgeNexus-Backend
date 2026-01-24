import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("Cassielw2050*", 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'admin@janusforge.ai' }, // Change to your preferred email
    update: {},
    create: {
      email: 'admin@janusforge.ai',
      username: 'CassandraWilliamson',
      password_hash: hashedPassword,
      role: 'GOD_MODE', // 🛡️ Ensure this matches your Enum
      is_founder: true,
      tier: 'SOVEREIGN'
    },
  });

  console.log({ user });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
