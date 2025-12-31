import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendNightlyDigest() {
  console.log('🏛️ Initializing Nightly Digest Dispatch...');

  try {
    const latestForge = await prisma.dailyForge.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (!latestForge) {
      console.log('⚠️ No forge entry found for today. Aborting.');
      return;
    }

    const subscribers = await prisma.user.findMany({
      where: { digest_subscribed: true },
      select: { email: true, username: true }
    });

    console.log(`📡 Found ${subscribers.length} subscribers.`);

    for (const user of subscribers) {
      try {
        await resend.emails.send({
          from: 'Janus Forge <digest@janusforge.ai>',
          to: user.email,
          subject: `Nightly Digest: ${latestForge.title}`,
          html: `
            <div style="background-color: #000000; color: #ffffff; font-family: sans-serif; padding: 40px;">
              <div style="max-width: 600px; margin: 0 auto; border: 1px solid #3b82f6; border-radius: 24px; padding: 40px; background: #0a0a0a;">
                <h2 style="color: #3b82f6; text-transform: uppercase; letter-spacing: 2px;">The Nightly Forge</h2>
                <h1 style="font-size: 28px; margin-bottom: 20px;">${latestForge.title}</h1>
                <p style="color: #d1d5db; font-size: 15px; line-height: 1.6;">${latestForge.synthesis}</p>
                <a href="https://janusforge.ai/daily-forge" style="display: inline-block; background: #3b82f6; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; margin-top: 20px;">VIEW FULL DEBATE</a>
              </div>
            </div>
          `
        });
        console.log(`✅ Digest sent to ${user.email}`);
      } catch (err) {
        console.error(`❌ Failed to send to ${user.email}:`, err);
      }
    }
  } catch (error) {
    console.error('🚨 Critical Dispatch Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

sendNightlyDigest();
