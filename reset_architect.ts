import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@janusforge.ai';
  // CHOOSE YOUR PASSWORD HERE
  const newPassword = 'YourSecurePassword123!'; 
  const saltRounds = 10;
  
  const hash = await bcrypt.hash(newPassword, saltRounds);
  
  const user = await prisma.user.update({
    where: { email },
    data: { 
      password_hash: hash,
      role: 'GOD_MODE' // Double-check role alignment
    }
  });

  console.log(`✅ Success: ${user.username} is reset. Use your new password to sign in.`);
}

main()
  .catch(e => console.error("❌ Reset failed:", e))
  .finally(async () => await prisma.$disconnect());
