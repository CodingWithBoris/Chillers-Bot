// src/utils/ticketUtils.ts
import fs from "fs";
import path from "path";
import os from "os";
import TicketModel, { ITicket } from "../base/schema/Ticket";
import CustomClient from "../base/classes/CustomClient";
import { Collection, Message } from "discord.js";

export async function getNextTicketId(guildId: string): Promise<number> {
  const last = await TicketModel.findOne({ guildId }).sort({ ticketId: -1 }).lean();
  return last ? last.ticketId + 1 : 0;
}

/**
 * Flattens role ids from config.Departments (top-level and nested)
 */
export function collectDepartmentRoleIds(config: any): string[] {
  const ids: string[] = [];
  if (!config || !config.Departments) return ids;

  for (const [k, v] of Object.entries(config.Departments)) {
    if (typeof v === "string") ids.push(v);
    else if (typeof v === "object" && v !== null) {
      for (const subVal of Object.values(v)) if (typeof subVal === "string") ids.push(subVal);
    }
  }
  // de-duplicate
  return Array.from(new Set(ids));
}

/**
 * Create a transcript file of the entire channel messages and return the local filepath.
 * The file SHOULD be uploaded to the transcription channel and then removed.
 */
export async function createTranscriptFile(messages: Collection<string, Message>): Promise<string> {
  // messages expected in ascending chronological order
  const lines: string[] = [];
  for (const msg of messages.values()) {
    const timestamp = new Date(msg.createdTimestamp).toISOString();
    const author = `${msg.author.tag} (${msg.author.id})`;
    let content = msg.content ?? "";
    // If attachments exist, add URLs after content
    if (msg.attachments.size) {
      const urls = msg.attachments.map(a => a.url).join(" ");
      content = content ? `${content}\n[Attachments] ${urls}` : `[Attachments] ${urls}`;
    }
    lines.push(`[${timestamp}] ${author}: ${content}`);
    // include embeds summary if no content
    if (!msg.content && msg.embeds.length) {
      lines.push(`[${timestamp}] ${author}: [EMBED] ${JSON.stringify(msg.embeds.map(e => e.toJSON()), null, 2)}`);
    }
  }

  const out = lines.join(os.EOL);
  const filename = `ticket-transcript-${Date.now()}.txt`;
  const filepath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(filepath, out, { encoding: "utf8" });
  return filepath;
}

/**
 * Fetch all messages in a channel (up to entire history) and return them in chronological order.
 * `fetchBatch` will pull in batches of 100 until done.
 */
export async function fetchAllMessages(channel: any) {
  const all = new Collection<string, Message>();
  let lastId: string | undefined = undefined;
  while (true) {
    const options: any = { limit: 100 };
    if (lastId) options.before = lastId;
    const msgs = await channel.messages.fetch(options);
    if (!msgs.size) break;
    // prepend (we are fetching newest->older), add to collection
    msgs.forEach((m: Message<boolean>) => all.set(m.id, m));
    lastId = msgs.last()?.id;
    if (msgs.size < 100) break;
  }

  // messages were fetched newest->oldest, reverse them to chronological (oldest -> newest)
  const ordered = new Collection<string, Message>();
  Array.from(all.values()).reverse().forEach(m => ordered.set(m.id, m));
  return ordered;
}
