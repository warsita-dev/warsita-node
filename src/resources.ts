import { p, type Body, type RequestOptions, type Result, Transport } from "./client.js";

// One method per API operation. OPERATIONS (in index.ts) maps each operationId in openapi.yaml
// to its method; a test keeps the two in step.

type Opts = RequestOptions;
type NoSession<T> = Omit<T, "session_id">;

export class Messages {
  constructor(private readonly t: Transport) {}

  /**
   * Queues a message. An Idempotency-Key is generated for you (or pass your own), so the
   * client can retry safely: a repeat returns the message the first request queued.
   */
  send(body: NoSession<Body<"/v1/messages", "post">>, opts: Opts & { idempotencyKey?: string } = {}): Promise<Result<"/v1/messages", "post">> {
    const key = opts.idempotencyKey ?? crypto.randomUUID();
    return this.t.request({ method: "POST", path: "/v1/messages", body, headers: { "Idempotency-Key": key }, scoped: true, idempotent: true }, opts);
  }

  list(query: { limit?: number; status?: string; before?: string } = {}, opts: Opts = {}): Promise<Result<"/v1/messages", "get">> {
    return this.t.request({ method: "GET", path: "/v1/messages", query, scoped: true, idempotent: true }, opts);
  }

  get(id: string, opts: Opts = {}): Promise<Result<"/v1/messages/{id}", "get">> {
    return this.t.request({ method: "GET", path: `/v1/messages/${p(id)}`, scoped: true, idempotent: true }, opts);
  }

  /** Changes a sent text message, within 20 minutes of sending. */
  edit(id: string, text: string, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "PATCH", path: `/v1/messages/${p(id)}`, body: { text }, scoped: true }, opts);
  }

  /** Deletes a sent message for everyone in the chat. */
  delete(id: string, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "DELETE", path: `/v1/messages/${p(id)}`, scoped: true }, opts);
  }

  /** Queues a failed message again as a new message. */
  resend(id: string, opts: Opts = {}): Promise<Result<"/v1/messages/{id}/resend", "post">> {
    return this.t.request({ method: "POST", path: `/v1/messages/${p(id)}/resend`, scoped: true }, opts);
  }

  /** Reacts to a message; an empty emoji removes the reaction. */
  react(body: NoSession<Body<"/v1/messages/react", "post">>, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "POST", path: "/v1/messages/react", body, scoped: true }, opts);
  }

  markRead(body: NoSession<Body<"/v1/messages/read", "post">>, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "POST", path: "/v1/messages/read", body, scoped: true }, opts);
  }
}

export class Media {
  constructor(private readonly t: Transport) {}

  /** Uploads a file of up to 30 MB to send with `media_id`; it is kept for 7 days. */
  upload(file: Blob | Uint8Array, opts: Opts & { filename?: string; contentType?: string } = {}): Promise<Result<"/v1/media", "post">> {
    const blob = file instanceof Blob ? file : new Blob([file], { type: opts.contentType ?? "application/octet-stream" });
    const form = new FormData();
    form.append("file", blob, opts.filename ?? "file");
    return this.t.request({ method: "POST", path: "/v1/media", form }, opts);
  }

  /** A file, with a download link valid for an hour. */
  get(id: string, opts: Opts = {}): Promise<Result<"/v1/media/{id}", "get">> {
    return this.t.request({ method: "GET", path: `/v1/media/${p(id)}`, idempotent: true }, opts);
  }
}

export class Account {
  constructor(private readonly t: Transport) {}

  get(opts: Opts = {}): Promise<Result<"/v1/account", "get">> {
    return this.t.request({ method: "GET", path: "/v1/account", scoped: true, idempotent: true }, opts);
  }

  /** Shows the account online (`available`) or offline (`unavailable`). */
  setPresence(state: "available" | "unavailable", opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "POST", path: "/v1/presence", body: { state }, scoped: true }, opts);
  }

  /** Shows typing or recording in a chat, or stops it (`paused`). */
  setChatPresence(chat: string, state: "typing" | "recording" | "paused", opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "POST", path: "/v1/presence/chat", body: { chat, state }, scoped: true }, opts);
  }
}

export class Contacts {
  constructor(private readonly t: Transport) {}

  list(opts: Opts = {}): Promise<Result<"/v1/contacts", "get">> {
    return this.t.request({ method: "GET", path: "/v1/contacts", scoped: true, idempotent: true }, opts);
  }

  /** Which of up to 50 phone numbers use WhatsApp. */
  check(phones: string[], opts: Opts = {}): Promise<Result<"/v1/contacts/check", "post">> {
    return this.t.request({ method: "POST", path: "/v1/contacts/check", body: { phones }, scoped: true, idempotent: true }, opts);
  }

  get(jid: string, opts: Opts = {}): Promise<Result<"/v1/contacts/{jid}", "get">> {
    return this.t.request({ method: "GET", path: `/v1/contacts/${p(jid)}`, scoped: true, idempotent: true }, opts);
  }

  picture(jid: string, opts: Opts = {}): Promise<Result<"/v1/contacts/{jid}/picture", "get">> {
    return this.t.request({ method: "GET", path: `/v1/contacts/${p(jid)}/picture`, scoped: true, idempotent: true }, opts);
  }

  /** A person's phone number and LID, from either. */
  ids(jid: string, opts: Opts = {}): Promise<Result<"/v1/contacts/{jid}/ids", "get">> {
    return this.t.request({ method: "GET", path: `/v1/contacts/${p(jid)}/ids`, scoped: true, idempotent: true }, opts);
  }

  block(jid: string, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "POST", path: `/v1/contacts/${p(jid)}/block`, scoped: true }, opts);
  }

  unblock(jid: string, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "POST", path: `/v1/contacts/${p(jid)}/unblock`, scoped: true }, opts);
  }

  blocklist(opts: Opts = {}): Promise<Result<"/v1/contacts/blocklist", "get">> {
    return this.t.request({ method: "GET", path: "/v1/contacts/blocklist", scoped: true, idempotent: true }, opts);
  }
}

export class Groups {
  constructor(private readonly t: Transport) {}

  list(opts: Opts = {}): Promise<Result<"/v1/groups", "get">> {
    return this.t.request({ method: "GET", path: "/v1/groups", scoped: true, idempotent: true }, opts);
  }

  get(jid: string, opts: Opts = {}): Promise<Result<"/v1/groups/{jid}", "get">> {
    return this.t.request({ method: "GET", path: `/v1/groups/${p(jid)}`, scoped: true, idempotent: true }, opts);
  }

  create(body: NoSession<Body<"/v1/groups", "post">>, opts: Opts = {}): Promise<Result<"/v1/groups", "post">> {
    return this.t.request({ method: "POST", path: "/v1/groups", body, scoped: true }, opts);
  }

  /** Changes any of name, topic (description), announce and locked. */
  update(jid: string, body: Body<"/v1/groups/{jid}", "patch">, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "PATCH", path: `/v1/groups/${p(jid)}`, body, scoped: true }, opts);
  }

  /** Adds, removes, promotes or demotes people; answers with each person's outcome. */
  updateParticipants(
    jid: string,
    action: "add" | "remove" | "promote" | "demote",
    participants: string[],
    opts: Opts = {},
  ): Promise<Result<"/v1/groups/{jid}/participants", "post">> {
    return this.t.request({ method: "POST", path: `/v1/groups/${p(jid)}/participants`, body: { action, participants }, scoped: true }, opts);
  }

  /** Sets the picture from a JPEG, by `url` or `media_id`. */
  setPicture(jid: string, body: Body<"/v1/groups/{jid}/picture", "put">, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "PUT", path: `/v1/groups/${p(jid)}/picture`, body, scoped: true }, opts);
  }

  inviteLink(jid: string, opts: Opts = {}): Promise<Result<"/v1/groups/{jid}/invite-link", "get">> {
    return this.t.request({ method: "GET", path: `/v1/groups/${p(jid)}/invite-link`, scoped: true, idempotent: true }, opts);
  }

  /** Replaces the invite link; the old one stops working. */
  resetInviteLink(jid: string, opts: Opts = {}): Promise<Result<"/v1/groups/{jid}/invite-link/reset", "post">> {
    return this.t.request({ method: "POST", path: `/v1/groups/${p(jid)}/invite-link/reset`, scoped: true }, opts);
  }

  /** The group an invite link leads to, without joining. */
  inviteInfo(link: string, opts: Opts = {}): Promise<Result<"/v1/groups/invite-info", "get">> {
    return this.t.request({ method: "GET", path: "/v1/groups/invite-info", query: { link }, scoped: true, idempotent: true }, opts);
  }

  join(link: string, opts: Opts = {}): Promise<Result<"/v1/groups/join", "post">> {
    return this.t.request({ method: "POST", path: "/v1/groups/join", body: { link }, scoped: true }, opts);
  }

  leave(jid: string, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "POST", path: `/v1/groups/${p(jid)}/leave`, scoped: true }, opts);
  }
}

/** A session's webhook. Personal access token only. */
export class Webhook {
  constructor(private readonly t: Transport) {}

  get(sessionId: string, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}/webhook", "get">> {
    return this.t.request({ method: "GET", path: `/v1/sessions/${p(sessionId)}/webhook`, idempotent: true }, opts);
  }

  set(sessionId: string, body: Body<"/v1/sessions/{id}/webhook", "put">, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}/webhook", "put">> {
    return this.t.request({ method: "PUT", path: `/v1/sessions/${p(sessionId)}/webhook`, body }, opts);
  }

  rotateSecret(sessionId: string, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}/webhook/secret", "post">> {
    return this.t.request({ method: "POST", path: `/v1/sessions/${p(sessionId)}/webhook/secret` }, opts);
  }

  /** Sends a signed sample of an event to the webhook now. */
  test(sessionId: string, event: string, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}/webhook/test", "post">> {
    return this.t.request({ method: "POST", path: `/v1/sessions/${p(sessionId)}/webhook/test`, body: { event } }, opts);
  }

  deliveries(sessionId: string, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}/webhook/deliveries", "get">> {
    return this.t.request({ method: "GET", path: `/v1/sessions/${p(sessionId)}/webhook/deliveries`, idempotent: true }, opts);
  }

  /** Sends a delivered or failed event again, as a new delivery. */
  resend(sessionId: string, deliveryId: string, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}/webhook/deliveries/{delivery}/resend", "post">> {
    return this.t.request({ method: "POST", path: `/v1/sessions/${p(sessionId)}/webhook/deliveries/${p(deliveryId)}/resend` }, opts);
  }
}

/** Linking and managing WhatsApp numbers. Personal access token only. */
export class Sessions {
  readonly webhook: Webhook;

  constructor(private readonly t: Transport) {
    this.webhook = new Webhook(t);
  }

  list(opts: Opts = {}): Promise<Result<"/v1/sessions", "get">> {
    return this.t.request({ method: "GET", path: "/v1/sessions", idempotent: true }, opts);
  }

  /** Creates a session; the answer holds its API key, shown only this once. */
  create(body: Body<"/v1/sessions", "post">, opts: Opts = {}): Promise<Result<"/v1/sessions", "post">> {
    return this.t.request({ method: "POST", path: "/v1/sessions", body }, opts);
  }

  get(id: string, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}", "get">> {
    return this.t.request({ method: "GET", path: `/v1/sessions/${p(id)}`, idempotent: true }, opts);
  }

  update(id: string, body: Body<"/v1/sessions/{id}", "patch">, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}", "patch">> {
    return this.t.request({ method: "PATCH", path: `/v1/sessions/${p(id)}`, body }, opts);
  }

  delete(id: string, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "DELETE", path: `/v1/sessions/${p(id)}` }, opts);
  }

  connect(id: string, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "POST", path: `/v1/sessions/${p(id)}/connect` }, opts);
  }

  restart(id: string, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "POST", path: `/v1/sessions/${p(id)}/restart` }, opts);
  }

  /** Logs the linked number out; linking it again needs a new scan. */
  disconnect(id: string, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "POST", path: `/v1/sessions/${p(id)}/disconnect` }, opts);
  }

  qr(id: string, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}/qr", "get">> {
    return this.t.request({ method: "GET", path: `/v1/sessions/${p(id)}/qr`, idempotent: true }, opts);
  }

  /** An 8-character code to type in on the phone instead of scanning. */
  pairingCode(id: string, phone: string, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}/pairing-code", "post">> {
    return this.t.request({ method: "POST", path: `/v1/sessions/${p(id)}/pairing-code`, body: { phone } }, opts);
  }

  /** Replaces the session's API key; the old one stops working at once. */
  regenerateApiKey(id: string, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}/api-key", "post">> {
    return this.t.request({ method: "POST", path: `/v1/sessions/${p(id)}/api-key` }, opts);
  }

  logs(id: string, query: { limit?: number } = {}, opts: Opts = {}): Promise<Result<"/v1/sessions/{id}/logs", "get">> {
    return this.t.request({ method: "GET", path: `/v1/sessions/${p(id)}/logs`, query, idempotent: true }, opts);
  }

  /** Deletes the session's finished messages from its log. */
  clearMessages(id: string, opts: Opts = {}): Promise<void> {
    return this.t.request({ method: "DELETE", path: `/v1/sessions/${p(id)}/messages` }, opts);
  }

  /**
   * Streams the session's live state (status, QR code) as server-sent events. Each item is
   * one event's JSON. Stop it with an AbortSignal.
   */
  async *events(id: string, opts: Opts = {}): AsyncGenerator<Record<string, unknown>> {
    const res = await this.t.send({ method: "GET", path: `/v1/sessions/${p(id)}/events`, headers: { Accept: "text/event-stream" } }, opts);
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += value;
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) yield JSON.parse(data) as Record<string, unknown>;
      }
    }
  }
}
