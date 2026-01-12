import prisma from './lib/prisma';
import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();
const resend = new Resend(process.env.RESEND_API_KEY);
async function sendNightlyDigest() {
    console.log('🏛️ Initializing Nightly Digest Dispatch...');
    try {
        // 1. Get the most recent synthesis from the Daily Forge
        const latestForge = await prisma.dailyForge.findFirst({
            orderBy: { createdAt: 'desc' }
        });
        if (!latestForge) {
            console.log('⚠️ No forge entry found for today. Aborting.');
            return;
        }
        // 2. Identify all users opted into the briefing
        const subscribers = await prisma.user.findMany({
            where: { digest_subscribed: true },
            select: { email: true, username: true }
        });
        console.log(`📡 Found ${subscribers.length} subscribers.`);
        // 3. Dispatch the High-Fidelity Briefing
        for (const user of subscribers) {
            try {
                await resend.emails.send({
                    from: 'Janus Forge <digest@janusforge.ai>',
                    to: user.email,
                    subject: `Nightly Digest: ${latestForge.title}`,
                    html: `
            <div style="background-color: #000000; color: #ffffff; font-family: sans-serif; padding: 40px; line-height: 1.5;">
              <div style="max-width: 600px; margin: 0 auto; border: 1px solid #1e40af; border-radius: 32px; padding: 48px; background: linear-gradient(180deg, #0a0a0a 0%, #000000 100%);">
                
                <div style="text-align: center; margin-bottom: 40px;">
                  <h2 style="color: #3b82f6; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 4px; margin-bottom: 8px;">
                    The Janus Forge
                  </h2>
                  <h1 style="font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin: 0;">
                    Nightly <span style="color: #3b82f6;">Digest</span>
                  </h1>
                  <div style="height: 1px; background: linear-gradient(90deg, transparent, #1e40af, transparent); margin-top: 20px;"></div>
                </div>

                <div style="margin-bottom: 40px;">
                  <h3 style="font-size: 16px; font-weight: 800; color: #ffffff; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px;">
                    Consensus: ${latestForge.title}
                  </h3>
                  <div style="color: #d1d5db; font-size: 15px; line-height: 1.8; margin-bottom: 24px;">
                    ${latestForge.synthesis}
                  </div>
                </div>

                <div style="text-align: center; margin-bottom: 40px;">
                  <a href="https://janusforge.ai/daily-forge" 
                     style="background-color: #ffffff; color: #000000; padding: 16px 32px; border-radius: 12px; font-weight: 900; text-decoration: none; font-size: 11px; display: inline-block; letter-spacing: 2px;">
                    VIEW FULL DEBATE
                  </a>
                </div>

                <div style="border-top: 1px solid #1f2937; padding-top: 30px; text-align: center;">
                  <p style="color: #4b5563; font-size: 9px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">
                    Authorized Intelligence Briefing for Architect ${user.username}
                  </p>
                  <p style="font-size: 9px; color: #1e40af; margin-top: 8px; font-weight: bold;">
                    Neural Sovereignty: Phase 03 Active
                  </p>
                </div>
              </div>
            </div>
          `
                });
                console.log(`✅ Digest sent to ${user.email}`);
            }
            catch (err) {
                console.error(`❌ Failed to send to ${user.email}:`, err);
            }
        }
    }
    catch (error) {
        console.error('🚨 Critical Dispatch Error:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
sendNightlyDigest();
