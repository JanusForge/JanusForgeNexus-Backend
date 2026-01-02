import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function reset() {
  const password = "JanusForge2026!"; // This will be your new password
  const hash = await bcrypt.hash(password, 10);
  
  await prisma.user.update({
    where: { email: 'admin@janusforge.ai' },
    data: { 
      password_hash: hash,
      role: 'GOD_MODE'
    }
  });
  console.log("✅ Admin password reset to: JanusForge2026!");
  await prisma.$disconnect();
}

reset();
