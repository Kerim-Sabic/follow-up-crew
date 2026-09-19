// Browser-side bridge to the Hermes agent running on the user's own computer.
// Requests go straight from the browser to the loopback address — never through
// any server, since 127.0.0.1 on a server would be the wrong machine.

export type HermesSettings = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

const STORAGE_KEY = "crm.hermes";

export const DEFAULT_HERMES: HermesSettings = {
  baseUrl: "http://127.0.0.1:8642/v1",
  model: "hermes-agent",
  apiKey: "",
};

export const LOCAL_NETWORK_BLOCKED_MESSAGE =
  "Local network access is blocked. Allow Local Network Access for this site in your browser settings, then retry.";

export function loadHermes(): HermesSettings {
  if (typeof window === "undefined") return DEFAULT_HERMES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HERMES;
    const saved = JSON.parse(raw) as Partial<HermesSettings>;
    const merged = { ...DEFAULT_HERMES, ...saved };
    // Migrate away from older Ollama defaults.
    if (/11434/.test(merged.baseUrl)) merged.baseUrl = DEFAULT_HERMES.baseUrl;
    if (merged.model === "hermes3") merged.model = DEFAULT_HERMES.model;
    return merged;
  } catch {
    return DEFAULT_HERMES;
  }
}

export function saveHermes(settings: HermesSettings) {
  // API key stays on this device only — it is never sent to any backend.
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function endpoint(settings: HermesSettings, path: string) {
  return `${settings.baseUrl.replace(/\/+$/, "")}${path}`;
}

export function isLoopbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") return false;
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host.startsWith("127.");
  } catch {
    return false;
  }
}

export type HermesErrorKind =
  | "local-network-denied"
  | "cors"
  | "unauthorized"
  | "connection-refused"
  | "unavailable"
  | "model-missing"
  | "unknown";

export class HermesError extends Error {
  kind: HermesErrorKind;
  constructor(kind: HermesErrorKind, message: string) {
    super(message);
    this.name = "HermesError";
    this.kind = kind;
  }
}

/** Check the Local Network Access permission when the browser exposes it. */
export async function checkLocalNetworkPermission(): Promise<PermissionState | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unsupported";
  for (const name of ["local-network-access", "loopback-network"]) {
    try {
      const status = await navigator.permissions.query({ name } as unknown as PermissionDescriptor);
      return status.state;
    } catch {
      // Permission name unknown in this browser — try the next one.
    }
  }
  return "unsupported";
}

/** fetch() that asks Chromium for loopback-network permission on local URLs. */
export async function hermesFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const loopback = isLoopbackUrl(url);
  const requestInit = {
    ...init,
    mode: "cors" as RequestMode,
    ...(loopback ? { targetAddressSpace: "loopback" } : {}),
  } as RequestInit & { targetAddressSpace?: "loopback" };

  let request: Request;
  try {
    request = new Request(url, requestInit);
  } catch {
    // Older browsers reject the unknown init member on Request — fall back.
    return fetch(url, init as RequestInit);
  }
  return fetch(request);
}

function classifyNetworkError(error: unknown, loopback: boolean): HermesError {
  if (error instanceof Error && error.name === "AbortError") throw error;
  const raw = error instanceof Error ? error.message : String(error);
  const text = raw.toLowerCase();

  if (text.includes("local network") || text.includes("address space") || text.includes("private network")) {
    return new HermesError("local-network-denied", LOCAL_NETWORK_BLOCKED_MESSAGE);
  }
  if (text.includes("cors") || text.includes("blocked by")) {
    return new HermesError(
      "cors",
      "Hermes answered but rejected this site (CORS). Allow this site's origin in your Hermes server config, then retry.",
    );
  }
  if (loopback) {
    return new HermesError(
      "connection-refused",
      `Couldn't reach Hermes on your computer. Either Hermes isn't listening at this address, or the browser blocked the local connection. If Hermes is running, allow Local Network Access for this site and retry. (${raw})`,
    );
  }
  return new HermesError("unavailable", `Hermes could not be reached. (${raw})`);
}

async function request(settings: HermesSettings, path: string, init: RequestInit) {
  const url = endpoint(settings, path);
  let response: Response;
  try {
    response = await hermesFetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
      },
    });
  } catch (error) {
    throw classifyNetworkError(error, isLoopbackUrl(url));
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    if (response.status === 401 || response.status === 403) {
      throw new HermesError("unauthorized", "Hermes rejected the API key (401). Check the key in the settings above.");
    }
    if (response.status === 404) {
      throw new HermesError("model-missing", `Model "${settings.model}" or this address was not found (404). ${body}`);
    }
    throw new HermesError("unavailable", `Hermes replied with ${response.status}: ${body}`);
  }
  return response;
}

export type HermesMessage = { role: "system" | "user" | "assistant"; content: string };

export type HermesOptions = {
  temperature?: number;
  signal?: AbortSignal;
  onToken?: (chunk: string, full: string) => void;
  json?: boolean;
};

export async function hermesChat(
  settings: HermesSettings,
  messages: HermesMessage[],
  options?: HermesOptions,
): Promise<string> {
  const stream = Boolean(options?.onToken);
  const response = await request(settings, "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: options?.temperature ?? 0.4,
      stream,
      ...(options?.json ? { response_format: { type: "json_object" } } : {}),
    }),
    ...(options?.signal ? { signal: options.signal } : {}),
  });

  if (!stream || !response.body) {
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new HermesError("unavailable", "Hermes returned an empty answer.");
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const piece = chunk.choices?.[0]?.delta?.content;
        if (piece) { full += piece; options?.onToken?.(piece, full); }
      } catch {
        // ignore partial frames
      }
    }
  }
  if (!full) throw new HermesError("unavailable", "Hermes returned an empty answer.");
  return full;
}

export async function hermesModels(settings: HermesSettings): Promise<string[]> {
  const response = await request(settings, "/models", { method: "GET" });
  const data = (await response.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((item) => item.id);
}

/** Runs API (agent actions) — same loopback-aware transport. */
export async function hermesStartRun(settings: HermesSettings, body: unknown, signal?: AbortSignal) {
  const response = await request(settings, "/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  return response.json() as Promise<{ id: string; status?: string }>;
}

export async function hermesGetRun(settings: HermesSettings, id: string, signal?: AbortSignal) {
  const response = await request(settings, `/runs/${encodeURIComponent(id)}`, {
    method: "GET",
    ...(signal ? { signal } : {}),
  });
  return response.json() as Promise<{ id: string; status?: string; output?: unknown }>;
}

export async function hermesStopRun(settings: HermesSettings, id: string) {
  const response = await request(settings, `/runs/${encodeURIComponent(id)}/stop`, { method: "POST" });
  return response.json().catch(() => ({}));
}

export type HermesTestResult = {
  ok: boolean;
  kind?: HermesErrorKind;
  message: string;
  latencyMs: number;
  models: string[];
  hasModel: boolean;
};

export async function hermesTestConnection(settings: HermesSettings): Promise<HermesTestResult> {
  const permission = await checkLocalNetworkPermission();
  if (permission === "denied" && isLoopbackUrl(settings.baseUrl)) {
    return { ok: false, kind: "local-network-denied", message: LOCAL_NETWORK_BLOCKED_MESSAGE, latencyMs: 0, models: [], hasModel: false };
  }
  const started = performance.now();
  try {
    const models = await hermesModels(settings);
    const latencyMs = Math.round(performance.now() - started);
    const hasModel = models.includes(settings.model);
    if (!hasModel) {
      return {
        ok: false,
        kind: "model-missing",
        message: `Connected in ${latencyMs} ms, but the model "${settings.model}" isn't loaded. Available: ${models.join(", ") || "none"}.`,
        latencyMs,
        models,
        hasModel,
      };
    }
    return { ok: true, message: `Connected to "${settings.model}" in ${latencyMs} ms.`, latencyMs, models, hasModel };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    if (error instanceof HermesError) {
      return { ok: false, kind: error.kind, message: error.message, latencyMs, models: [], hasModel: false };
    }
    if (error instanceof Error && error.name === "AbortError") throw error;
    return { ok: false, kind: "unknown", message: "Hermes could not be reached.", latencyMs, models: [], hasModel: false };
  }
}

export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.search(/[[{]/);
  const end = Math.max(candidate.lastIndexOf("]"), candidate.lastIndexOf("}"));
  if (start === -1 || end === -1) throw new Error("Hermes did not return usable data.");
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

/**
 * Pull complete top-level objects out of a partially-streamed JSON array so the
 * UI can show results while the model is still writing.
 */
export function parsePartialObjects<T>(text: string): T[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*)/);
  const source = fenced?.[1] ?? text;
  const out: T[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{") { if (depth === 0) start = i; depth += 1; continue; }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        try { out.push(JSON.parse(source.slice(start, i + 1)) as T); } catch { /* skip */ }
        start = -1;
      }
    }
  }
  return out;
}
