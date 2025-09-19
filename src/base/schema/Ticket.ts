// src/base/schema/Ticket.ts
import { Schema, model, Document } from "mongoose";

export interface ITicket extends Document {
  guildId: string;
  ticketId: number;
  channelId: string;
  creatorId: string;
  type: string;
  modalResponses: Record<string, string>;
  claimedBy?: string | null;
  status: "open" | "closed";
  createdAt: Date;
  closedAt?: Date | null;
  closeReason?: string | null;
  transcriptMessageId?: string | null; // id of message in transcription channel (optional)
}

const TicketSchema = new Schema<ITicket>(
  {
    guildId: { type: String, required: true },
    ticketId: { type: Number, required: true },
    channelId: { type: String, required: true },
    creatorId: { type: String, required: true },
    type: { type: String, required: true },
    modalResponses: { type: Schema.Types.Mixed, default: {} },
    claimedBy: { type: String, default: null },
    status: { type: String, default: "open" },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, default: null },
    transcriptMessageId: { type: String, default: null },
  },
  { timestamps: true }
);

export default model<ITicket>("Ticket", TicketSchema);
