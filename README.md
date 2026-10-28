# Warsita for Node.js

The official Node.js client for the [Warsita](https://warsita.com) WhatsApp API: send messages, manage sessions, contacts and groups, and verify webhooks. TypeScript types come straight from the [OpenAPI spec](https://warsita.com/openapi.yaml).

```bash
npm install warsita
```

Node.js 20 or newer. No runtime dependencies.

## Send a message

```js
import Warsita from "warsita";

const warsita = new Warsita({ apiKey: process.env.WARSITA_API_KEY }); // the session's wsk_… key

const message = await warsita.messages.send({ to: "+6281234567890", text: "Your order has shipped." });
console.log(message.id, message.status); // msg_… queued
```

Every `send` carries an `Idempotency-Key` (generated, or pass `{ idempotencyKey }`), so the client retries rate limits and dropped connections without sending twice.

```js
import { readFile } from "node:fs/promises";

await warsita.messages.send({ to: "120363012345678901@g.us", image: { url: "https://example.com/receipt.png", caption: "Receipt" } });
await warsita.messages.send({ to: "+6281234567890", poll: { name: "Which day?", options: ["Friday", "Saturday"], selectable_count: 1 } });

const file = await warsita.media.upload(await readFile("invoice.pdf"), { filename: "invoice.pdf", contentType: "application/pdf" });
await warsita.messages.send({ to: "+6281234567890", document: { media_id: file.id } });
```

## Personal access tokens

A session API key (`wsk_…`) acts for its own session. A personal access token (`wsp_…`) acts for the whole workspace and manages sessions; name the session for messaging calls:

```js
const warsita = new Warsita({ apiKey: process.env.WARSITA_TOKEN, sessionId: "ses_3kV9mQ2pX7aL0zR5tN8w" });
const sessions = await warsita.sessions.list();
await warsita.groups.list({ sessionId: sessions[1].id }); // or per call
```

## Receive webhooks

Pass the raw body, not parsed JSON:

```js
import express from "express";
import { verifyWebhook } from "warsita";

app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const event = verifyWebhook(req.body, req.get("X-Warsita-Signature"), process.env.WARSITA_WEBHOOK_SECRET);
  if (event.event === "messages.received") console.log(event.data.text);
  res.sendStatus(200);
});
```

`verifyWebhook` throws on a wrong signature or one older than five minutes.

## What's included

| | |
| --- | --- |
| `messages` | `send`, `list`, `get`, `edit`, `delete`, `resend`, `react`, `markRead` |
| `media` | `upload`, `get` |
| `account` | `get`, `setPresence`, `setChatPresence` |
| `contacts` | `list`, `check`, `get`, `picture`, `ids`, `block`, `unblock`, `blocklist` |
| `groups` | `list`, `get`, `create`, `update`, `updateParticipants`, `setPicture`, `inviteLink`, `resetInviteLink`, `inviteInfo`, `join`, `leave` |
| `sessions` | `list`, `create`, `get`, `update`, `delete`, `connect`, `restart`, `disconnect`, `qr`, `pairingCode`, `regenerateApiKey`, `logs`, `clearMessages`, `events` (live stream) |
| `sessions.webhook` | `get`, `set`, `rotateSecret`, `test`, `deliveries`, `resend` |

Responses that hold only `data` are unwrapped. Errors are `WarsitaError` with the API's `status`, `code` and `message` (and `retryAfter` on rate limits). The full reference is at [warsita.com/docs](https://warsita.com/docs), with an SDK guide at [warsita.com/docs/sdks](https://warsita.com/docs/sdks).

## Development

`openapi.yaml` is a copy of the published spec; `npm run update-spec` refreshes it and the generated types (`src/schema.ts`). `npm test` builds and checks that every operation in the spec has a method.
