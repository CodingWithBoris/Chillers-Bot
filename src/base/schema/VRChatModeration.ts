// src/base/schema/VRChatModeration.ts
import { Schema, model, Document, Types } from "mongoose";

export interface IVRChatModeration extends Document {
  userId: Types.ObjectId; // FK → VRChatUserInfo._id
  modAction: "Kick" | "ForceMute" | "Ban" | "Warn";
  reason?: string; // Optional: may be empty for in-instance actions
  moderatorId: string; // Could be VRChat or Discord mod ID
  duration?: number; // Duration in seconds (time-based actions)
  source: "VRChatInstance" | "DiscordGroup"; // Origin of the action
  globalBan?: boolean; // True if this ban applies globally (both VRChat & Discord)
  createdAt: Date;
  expiresAt?: Date;
  active: boolean;
}

const VRChatModerationSchema = new Schema<IVRChatModeration>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "VRChatUserInfo",
      required: true,
    },
    modAction: {
      type: String,
      enum: ["Kick", "ForceMute", "Ban", "Warn"],
      required: true,
    },
    reason: {
      type: String,
      required: false,
      default: "",
    },
    moderatorId: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      default: null,
    },
    source: {
      type: String,
      enum: ["VRChatInstance", "DiscordGroup"],
      required: true,
    },
    globalBan: {
      type: Boolean,
      default: false, // Set true for Ban actions to apply across both platforms
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default model<IVRChatModeration>("VRChatModeration", VRChatModerationSchema);
