import type { paths } from "./schema.js";
import { VERSION } from "./version.js";

// The transport: authentication, session_id, retries, errors and unwrapping { data }.

type Method = "get" | "post" | "put" | "patch" | "delete";
type Op<P extends keyof paths, M extends Method> = NonNullable<paths[P][M]>;
type JSONOf<R> = R extends { content: { "application/json": infer J } } ? J : void;

/** The JSON body an operation takes. */
export type Body<P extends keyof paths, M extends Method> =
  Op<P, M> extends { requestBody?: { content: { "application/json": infer B } } } ? B : never;

/** What an operation answers, with a lone `data` field unwrapped. */
export type Result<P extends keyof paths, M extends Method> = Unwrap<
  Op<P, M> extends { responses: infer R }
    ? R extends { 200: infer A }
      ? JSONOf<A>
      : R extends { 201: infer A }
        ? JSONOf<A>
        : R extends { 202: infer A }
          ? JSONOf<A>
          : void
    : never
>;

type Unwrap<T> = T extends { data?: infer D } ? ([Exclude<keyof T, "data">] extends [never] ? NonNullable<D> : T) : T;

export interface WarsitaOptions {
  /** A session API key (`wsk_…`) or a personal access token (`wsp_…`). Defaults to `WARSITA_API_KEY`. */
  apiKey?: string;
  /** With a personal access token: the session to use when a call names none. */
  sessionId?: string;
  /** Defaults to `https://api.warsita.com`. */
  baseURL?: string;
  /** Retries for rate limits and, where safe, server and network errors. Defaults to 2. */
  maxRetries?: number;
  /** Per attempt, in milliseconds. Defaults to 60 000. */
  timeout?: number;
  /** A fetch implementation, e.g. for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** Per-call options. */
export interface RequestOptions {
  /** With a personal access token: the session to act for. */
  sessionId?: string;
  signal?: AbortSignal;
}

/** An error answered by the API, with its stable `code`, or a network failure (`status` 0). */
export class WarsitaError extends Error {
  readonly status: number;
  readonly code: string;
  /** Seconds to wait before retrying, from `Retry-After`. */
  readonly retryAfter?: number;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = "WarsitaError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export interface Call {
  method: Uppercase<Method>;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  /** Acts for one session: with a token, session_id is added. */
  scoped?: boolean;
  /** Safe to send twice: GETs, and sends with an Idempotency-Key. */
  idempotent?: boolean;
  stream?: boolean;
}

export class Transport {
  readonly apiKey: string;
  readonly sessionId?: string;
  readonly baseURL: string;
  readonly maxRetries: number;
  readonly timeout: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: WarsitaOptions = {}) {
    const apiKey = opts.apiKey ?? (typeof process !== "undefined" ? process.env.WARSITA_API_KEY : undefined);
    if (!apiKey) throw new Error("Warsita: pass apiKey or set WARSITA_API_KEY.");
    this.apiKey = apiKey;
    this.sessionId = opts.sessionId;
    this.baseURL = (opts.baseURL ?? "https://api.warsita.com").replace(/\/+$/, "");
    this.maxRetries = opts.maxRetries ?? 2;
    this.timeout = opts.timeout ?? 60_000;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
  }

  /** A session API key already picks its session; a token needs session_id. */
  get usesToken(): boolean {
    return !this.apiKey.startsWith("wsk_");
  }

  async request<T>(call: Call, opts: RequestOptions = {}): Promise<T> {
    const res = await this.send(call, opts);
    if (res.status === 204) return undefined as T;
    const json = (await res.json()) as unknown;
    if (json && typeof json === "object" && !Array.isArray(json)) {
      const keys = Object.keys(json);
      if (keys.length === 1 && keys[0] === "data") return (json as { data: T }).data;
    }
    return json as T;
  }

  /** Sends a call and returns the successful response; it throws WarsitaError otherwise. */
  async send(call: Call, opts: RequestOptions = {}): Promise<Response> {
    const url = new URL(this.baseURL + call.path);
    let body = call.body;
    if (call.scoped && this.usesToken) {
      const sessionId = opts.sessionId ?? this.sessionId;
      if (!sessionId) throw new Error("Warsita: pass sessionId (in the client or the call) when using a personal access token.");
      if (call.method === "POST") body = { ...(body as object | undefined), session_id: sessionId };
      else url.searchParams.set("session_id", sessionId);
    }
    for (const [k, v] of Object.entries(call.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}`, "User-Agent": `warsita-node/${VERSION}`, ...call.headers };
    if (body !== undefined && !call.form) headers["Content-Type"] = "application/json";

    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(this.timeout);
      const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: call.method,
          headers,
          body: call.form ?? (body === undefined ? undefined : JSON.stringify(body)),
          signal,
        });
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        if (call.idempotent && attempt < this.maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new WarsitaError(0, "network_error", `Warsita: ${(err as Error).message}`);
      }
      if (res.ok) return res;

      const retryAfter = Number(res.headers.get("Retry-After")) || undefined;
      // A rate-limited call was not processed, so any call may retry; server errors only when
      // repeating it is harmless.
      const retryable = res.status === 429 || (call.idempotent && [500, 503, 504].includes(res.status));
      if (retryable && attempt < this.maxRetries) {
        await sleep(retryAfter ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      let code = "http_error";
      let message = `Warsita: HTTP ${res.status}`;
      try {
        const err = ((await res.json()) as { error?: { code?: string; message?: string } }).error;
        if (err?.code) code = err.code;
        if (err?.message) message = err.message;
      } catch {
        // not JSON
      }
      throw new WarsitaError(res.status, code, message, retryAfter);
    }
  }
}

function backoff(attempt: number): number {
  return 500 * 2 ** attempt + Math.random() * 250;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A path parameter, escaped. */
export function p(value: string): string {
  return encodeURIComponent(value);
}
