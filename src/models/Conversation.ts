import mongoose, { Schema, Document } from 'mongoose';

/**
 * 🛰️ NEURAL HISTORY SCHEMA: JANUS FORGE NEXUS ®
 * Designed to store parallel AI responses for archival retrieval.
 */
export interface IConversation extends Document {
  userId: mongoose.Types.ObjectId;
  prompt: string;
  title: string;
  type: 'NEXUS_PRIME' | 'DAILY_FORGE';
  results: Array<{
    model: string;
    response?: string;
    error?: string;
  }>;
  timestamp: Date;
}

const ConversationSchema: Schema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true // Optimized for Neural History lookups
  },
  prompt: { 
    type: String, 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  // ✅ THE BOUNDARY: Distinguishes between feature sets
  type: { 
    type: String, 
    enum: ['NEXUS_PRIME', 'DAILY_FORGE'], 
    default: 'NEXUS_PRIME' 
  },
  // ✅ THE COUNCIL: Stores the adversarial showdown results
  results: [{
    model: String,
    response: String,
    error: String
  }],
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

export default mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);
