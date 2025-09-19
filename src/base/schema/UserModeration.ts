// src/base/schema/UserModeration.ts
import { Schema, model, Document } from "mongoose";

export interface IWarning {
  count: number;
  dates: Date[];
  mods: string[];
}

export interface IPunishment {
  type: string;      // e.g. "mute", "ban", "timeout", "kick"
  reason: string;
  duration?: string;
  modId: string;
  date: Date;
}

export interface IUserModeration extends Document {
  userId: string;
  guildId: string;
  threadId?: string;
  profileMessageId?: string;
  notes: string;
  warnings: Map<string, IWarning>;
  punishments: IPunishment[];
}

const WarningSchema = new Schema(
  {
    count: Number,
    dates: [Date],
    mods: [String],
  },
  { _id: false }
);

// Important: define a subdocument schema for punishments and make `type` explicit
const PunishmentSchema = new Schema(
  {
    // 'type' field is declared as an object with key 'type' to avoid Mongoose shorthand
    type: { type: String, required: true },
    reason: { type: String, required: true },
    duration: { type: String },
    modId: { type: String, required: true },
    date: { type: Date, required: true },
  },
  { _id: false }
);

const schema = new Schema<IUserModeration>(
  {
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    threadId: String,
    profileMessageId: String,
    notes: String,
    warnings: {
      type: Map,
      of: WarningSchema,
      default: {},
    },
    punishments: { type: [PunishmentSchema], default: [] },
  },
  { timestamps: true }
);

export default model<IUserModeration>("UserModeration", schema);
