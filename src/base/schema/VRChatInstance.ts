// src/base/schema/VRChatInstance.ts
import { model, Schema, Document } from "mongoose";

export interface IVRChatInstance extends Document {
  instanceId: string;
  worldId: string;
  instanceName: string;
  createdAt: Date;
  closedAt?: Date;
  openedBy?: string; // VRChat userId or display name
  isGroupInstance: boolean;
  isActive: boolean;
  durationSeconds?: number;
}

const instanceSchema = new Schema<IVRChatInstance>(
  {
    instanceId: { type: String, required: true },
    worldId: { type: String, required: true },
    instanceName: String,
    createdAt: { type: Date, default: Date.now },
    closedAt: Date,
    openedBy: String,
    isGroupInstance: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    durationSeconds: Number,
  },
  { timestamps: true }
);

export default model<IVRChatInstance>("VRChatInstance", instanceSchema);
