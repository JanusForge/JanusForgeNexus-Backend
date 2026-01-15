import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const transmitSupportTicket = async (req: Request, res: Response) => {
  try {
    const { subject, message, userId } = req.body;

    // 🛡️ Data Integrity Check
    if (!subject || !message || !userId) {
      return res.status(400).json({ 
        error: "Incomplete Transmission: Subject, message, and UserID are required." 
      });
    }

    // 🏛️ Save to Neon DB
    const ticket = await prisma.supportTicket.create({
      data: {
        subject,
        message,
        user_id: userId, // Maps to the schema relationship
        status: "OPEN",
        priority: "NORMAL"
      },
    });

    console.log(`[Support] New transmission received from Architect: ${userId}`);

    return res.status(201).json({
      success: true,
      message: "Transmission logged in the Nexus database.",
      ticketId: ticket.id
    });

  } catch (error) {
    console.error("Support Handshake Failed:", error);
    return res.status(500).json({ 
      error: "Neural Link Error: Could not save transmission to database." 
    });
  }
};

/**
 * 🕵️ fetchUserTickets
 * Allows an Architect to see their own past support history
 */
export const getUserTickets = async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });
    return res.json(tickets);
  } catch (error) {
    return res.status(500).json({ error: "Failed to retrieve transmission history." });
  }
};
