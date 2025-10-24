import { model, Schema, Types } from "mongoose";

// src/base/schema/UserPresence.ts
export interface IUserPresence extends Document {
  userId: Types.ObjectId;
  instanceId: Types.ObjectId;
  joinedAt: Date;
  leftAt?: Date;
  duration?: number;
}

const presenceSchema = new Schema<IUserPresence>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "VRChatUserInfo", required: true },
    instanceId: { type: Schema.Types.ObjectId, ref: "VRChatInstance", required: true },
    joinedAt: { type: Date, required: true },
    leftAt: Date,
    duration: Number,
  },
  { timestamps: true }
);

export default model<IUserPresence>("UserPresence", presenceSchema);
