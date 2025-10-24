// src/base/schema/VRChatUserInfo.ts
import { Schema, model, Document, Types } from "mongoose";

export interface IInstanceInfo {
  instanceId: string;
  joinedAt: Date;
  leftAt?: Date;
  duration?: number; // in seconds, optional calculated field
}

export interface IVRChatUserInfo extends Document {
  discordId?: string; // FK → VerifiedUser.discordId
  vrchatId: string; // VRChat user ID
  username: string; // VRChat display name
  trustLevel?: string; // e.g., "Visitor", "New User", "User", "Trusted User", etc.
  is18Plus?: boolean; // 18+ verified in VRChat
  instances: IInstanceInfo[];
  notes?: string;
  moderation: Types.ObjectId[]; // FK → VRChatModeration._id
  lastSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InstanceInfoSchema = new Schema<IInstanceInfo>(
  {
    instanceId: { type: String, required: true },
    joinedAt: { type: Date, required: true },
    leftAt: Date,
    duration: Number,
  },
  { _id: false }
);

const VRChatUserInfoSchema = new Schema<IVRChatUserInfo>(
  {
    discordId: { type: String, ref: "VerifiedUser", required: false },
    vrchatId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    trustLevel: { type: String, default: "Unknown" },
    is18Plus: { type: Boolean, default: false },
    instances: { type: [InstanceInfoSchema], default: [] },
    notes: { type: String, default: "" },
    moderation: [
      { type: Schema.Types.ObjectId, ref: "VRChatModeration", default: [] },
    ],
    lastSeen: Date,
  },
  { timestamps: true }
);

export default model<IVRChatUserInfo>("VRChatUserInfo", VRChatUserInfoSchema);
