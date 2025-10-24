// src/base/schema/VerifiedUser.ts
import { Schema, model, Document } from "mongoose";

export interface IVerifiedUser extends Document {
  discordId: string;
  vrchatId: string;
  username: string;
  verificationCode: string;
  verifiedAt: Date;
}

const VerifiedUserSchema = new Schema<IVerifiedUser>({
  discordId: { type: String, required: true, unique: true },
  vrchatId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  verificationCode: { type: String, required: true },
  verifiedAt: { type: Date, default: Date.now },
});

export default model<IVerifiedUser>("VerifiedUser", VerifiedUserSchema);
