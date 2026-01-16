import mongoose, { Schema, Document } from 'mongoose';

/**
 * 🛰️ NEURAL HISTORY SCHEMA: JANUS FORGE NEXUS ®
 * Updated to support UUID string formats.
 */
export interface IConversation extends Document {
  userId: string; // ✅ Changed from mongoose.Types.ObjectId to string
  prompt: string;
  title: string;
  type: 'NEXUS_PRIME' | 'DAILY_FORGE';
  isPublic?: boolean; // Added for the sharing feature
  shareSlug?: string; // Added for the sharing feature
  results: Array<{
    model: string;
    response?: string;
    error?: string;
  }>;
  timestamp: Date;
}

const ConversationSchema: Schema = new Schema({
  userId: {
    type: String, // ✅ Changed from Schema.Types.ObjectId to String
    required: true,
    index: true 
  },
  prompt: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['NEXUS_PRIME', 'DAILY_FORGE'],
    default: 'NEXUS_PRIME'
  },
  results: [{
    model: String,
    response: String,
    error: String
  }],
  // ✅ ADDED: Supporting fields for the Public Sharing protocol
  isPublic: { type: Boolean, default: false },
  shareSlug: { type: String, unique: true, sparse: true },
  
  timestamp: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);
