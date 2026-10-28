import { createHmac, timingSafeEqual } from "node:crypto";

import { Transport, type WarsitaOptions } from "./client.js";
import { Account, Contacts, Groups, Media, Messages, Sessions } from "./resources.js";
import type { components } from "./schema.js";

export { WarsitaError, type RequestOptions, type WarsitaOptions } from "./client.js";
export type { components, paths } from "./schema.js";

type S = components["schemas"];
export type Message = S["Message"];
export type SendMessage = S["SendMessage"];
export type Session = S["Session"];
export type Group = S["Group"];
export type Contact = S["Contact"];
export type MediaFile = S["MediaFile"];
export type WebhookEvent = S["WebhookEvent"];
export type IncomingMessage = S["IncomingMessage"];

/**
 * The Warsita API client.
 *
 *     const warsita = new Warsita({ apiKey: process.env.WARSITA_API_KEY });
 *     await warsita.messages.send({ to: "+6281234567890", text: "Hello" });
 *
 * A session API key (`wsk_…`) acts for its session. A personal access token (`wsp_…`) acts for
 * the workspace: pass `sessionId` to the client or to each call.
 */
export class Warsita {
  readonly messages: Messages;
  readonly media: Media;
  readonly account: Account;
  readonly contacts: Contacts;
  readonly groups: Groups;
  readonly sessions: Sessions;
  private readonly t: Transport;

  constructor(opts: WarsitaOptions = {}) {
    this.t = new Transport(opts);
    this.messages = new Messages(this.t);
    this.media = new Media(this.t);
    this.account = new Account(this.t);
    this.contacts = new Contacts(this.t);
    this.groups = new Groups(this.t);
    this.sessions = new Sessions(this.t);
  }

  /** Whether the API is up. */
  health(): Promise<{ status?: string }> {
    return this.t.request({ method: "GET", path: "/health", idempotent: true });
  }
}

export default Warsita;

/** A webhook delivery's body. */
export interface WebhookPayload<T = Record<string, unknown>> {
  event: WebhookEvent;
  session_id: string;
  timestamp: string;
  data: T;
}

/**
 * Checks a webhook delivery's X-Warsita-Signature against your webhook secret and returns the
 * parsed body. Pass the raw body exactly as received. It throws when the signature is wrong or
 * more than `toleranceSeconds` old (default 300), which stops replays.
 */
export function verifyWebhook<T = Record<string, unknown>>(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  secret: string,
  { toleranceSeconds = 300, now = Date.now() }: { toleranceSeconds?: number; now?: number } = {},
): WebhookPayload<T> {
  const parts = Object.fromEntries((signatureHeader ?? "").split(",").map((kv) => kv.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t)) throw new Error("Warsita webhook: missing or malformed X-Warsita-Signature.");
  if (Math.abs(now / 1000 - t) > toleranceSeconds) throw new Error("Warsita webhook: the signature is too old.");
  const body = typeof rawBody === "string" ? Buffer.from(rawBody) : Buffer.from(rawBody);
  const expected = createHmac("sha256", secret).update(`${parts.t}.`).update(body).digest();
  const given = Buffer.from(parts.v1, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("Warsita webhook: the signature does not match.");
  return JSON.parse(body.toString("utf8")) as WebhookPayload<T>;
}

/** Each operationId in openapi.yaml and the method that calls it. */
export const OPERATIONS: Record<string, string> = {
  sendMessage: "messages.send",
  listMessages: "messages.list",
  getMessage: "messages.get",
  editMessage: "messages.edit",
  deleteMessage: "messages.delete",
  resendMessage: "messages.resend",
  reactToMessage: "messages.react",
  markRead: "messages.markRead",
  uploadMedia: "media.upload",
  getMedia: "media.get",
  getAccount: "account.get",
  setPresence: "account.setPresence",
  setChatPresence: "account.setChatPresence",
  listContacts: "contacts.list",
  checkContacts: "contacts.check",
  getContact: "contacts.get",
  getContactPicture: "contacts.picture",
  getContactIDs: "contacts.ids",
  blockContact: "contacts.block",
  unblockContact: "contacts.unblock",
  getBlocklist: "contacts.blocklist",
  listGroups: "groups.list",
  getGroup: "groups.get",
  createGroup: "groups.create",
  updateGroup: "groups.update",
  updateGroupParticipants: "groups.updateParticipants",
  setGroupPicture: "groups.setPicture",
  getGroupInviteLink: "groups.inviteLink",
  resetGroupInviteLink: "groups.resetInviteLink",
  getGroupInviteInfo: "groups.inviteInfo",
  joinGroup: "groups.join",
  leaveGroup: "groups.leave",
  listSessions: "sessions.list",
  createSession: "sessions.create",
  getSession: "sessions.get",
  updateSession: "sessions.update",
  deleteSession: "sessions.delete",
  connectSession: "sessions.connect",
  restartSession: "sessions.restart",
  disconnectSession: "sessions.disconnect",
  getSessionQR: "sessions.qr",
  requestPairingCode: "sessions.pairingCode",
  regenerateApiKey: "sessions.regenerateApiKey",
  getSessionLogs: "sessions.logs",
  streamSessionEvents: "sessions.events",
  clearMessages: "sessions.clearMessages",
  getWebhook: "sessions.webhook.get",
  setWebhook: "sessions.webhook.set",
  rotateWebhookSecret: "sessions.webhook.rotateSecret",
  testWebhook: "sessions.webhook.test",
  listWebhookDeliveries: "sessions.webhook.deliveries",
  resendWebhookDelivery: "sessions.webhook.resend",
  health: "health",
};
