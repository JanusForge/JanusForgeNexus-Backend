import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Resend } from 'resend';

// Initialize with your existing API key from Render env vars
const resend = new Resend(process.env.RESEND_API_KEY);

export const transmitSupportTicket = async (req: Request, res: Response) => {
  try {
    const { subject, message, userId } = req.body;

    if (!subject || !message || !userId) {
      return res.status(400).json({ error: "Missing transmission data." });
    }

    // 1. Record the transmission in Neon (Index #11)
    const ticket = await prisma.supportTicket.create({
      data: {
        subject,
        message,
        user_id: userId,
        status: "OPEN",
        priority: "NORMAL"
      },
    });

    // 2. Dispatch to your Authority Inbox via Resend
    await resend.emails.send({
      from: 'Nexus Support <support@janusforge.ai>',
      to: 'support@janusforge.ai',
      subject: `[SUPPORT TICKET] ${subject}`,
      html: `
        <div style="font-family: monospace; background-color: #000; color: #fff; padding: 30px; border: 1px solid #333;">
          <h2 style="color: #3b82f6; border-bottom: 1px solid #333; padding-bottom: 10px;">NEURAL LINK TRANSMISSION</h2>
          <p><strong>ARCHITECT ID:</strong> ${userId}</p>
          <p><strong>SUBJECT:</strong> ${subject}</p>
          <div style="background: #111; padding: 20px; border-radius: 10px; margin-top: 20px;">
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
          <p style="font-size: 10px; color: #555; margin-top: 30px;">RECORDED IN NEON TABLE: support_tickets</p>
        </div>
      `,
    });

    return res.status(201).json({
      success: true,
      ticketId: ticket.id
    });

  } catch (error) {
    console.error("Support Dispatch Error:", error);
    return res.status(500).json({ error: "Transmission failed to reach the Architects." });
  }
};

export const getUserTickets = async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });
    return res.json(tickets);
  } catch (error) {
    return res.status(500).json({ error: "Failed to retrieve history." });
  }
};
