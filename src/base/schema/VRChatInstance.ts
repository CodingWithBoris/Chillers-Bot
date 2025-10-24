import { model, Schema } from "mongoose";

// src/base/schema/VRChatInstance.ts
export interface IVRChatInstance extends Document {
  instanceId: string;
  worldId: string;
  instanceName: string;
  createdAt: Date;
  isGroupInstance: boolean;
  isActive: boolean;
}

const instanceSchema = new Schema<IVRChatInstance>(
  {
    instanceId: { type: String, required: true },
    worldId: { type: String, required: true },
    instanceName: String,
    createdAt: { type: Date, default: Date.now },
    isGroupInstance: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<IVRChatInstance>("VRChatInstance", instanceSchema);
