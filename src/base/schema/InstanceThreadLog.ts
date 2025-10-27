import { Schema, model, Document } from "mongoose";

/**
 * InstanceThreadLog keeps track of the Discord thread used to log
 * first‑join and moderator activity for a specific VRChat instance.
 * Each document is keyed by the VRChat instance ID and guild ID so
 * that multiple guilds can maintain separate logs for the same
 * instance if necessary.  The threadId stores the ID of the
 * Discord thread and messageId stores the ID of the initial message
 * in that thread (useful for editing or tracking the starter).
 */
export interface IInstanceThreadLog extends Document {
  instanceId: string;
  guildId: string;
  threadId?: string;
  messageId?: string;
}

const instanceThreadLogSchema = new Schema<IInstanceThreadLog>(
  {
    instanceId: { type: String, required: true },
    guildId: { type: String, required: true },
    threadId: { type: String },
    messageId: { type: String },
  },
  { timestamps: true }
);

export default model<IInstanceThreadLog>("InstanceThreadLog", instanceThreadLogSchema);