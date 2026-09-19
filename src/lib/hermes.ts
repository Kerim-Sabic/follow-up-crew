// Browser-side bridge to a Hermes model running on the user's own computer.
// Works with any OpenAI-compatible local server (Ollama, LM Studio, llama.cpp, vLLM).

export type HermesSettings = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

const STORAGE_KEY = "crm.hermes";

export const DEFAULT_HERMES: HermesSettings = {
  baseUrl: "http://localhost:11434/v1",
  model: "hermes3",
  apiKey: "",
};

export function loadHermes(): HermesSettings {
  if (typeof window === "undefined") return DEFAULT_HERMES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HERMES;
    return { ...DEFAULT_HERMES, ...(JSON.parse(raw) as Partial<HermesSettings>) };
  } catch {
    return DEFAULT_HERMES;
  }
}

export function saveHermes(settings: HermesSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function endpoint(settings: HermesSettings, path: string) {
  return `${settings.baseUrl.replace(/\/+$/, "")}${path}`;
}

export type HermesMessage = { role: "system" | "user" | "assistant"; content: string };

export type HermesOptions = {
  temperature?: number;
  signal?: AbortSignal;
  onToken?: (chunk: string, full: string) => void;
  json?: boolean;
};

function friendly(error: unknown): Error {
  if (error instanceof Error) {
    if (error.name === "AbortError") return error;
    if (error.message === "Failed to fetch" || error.name === "TypeError") {
      return new Error(
        "Couldn't reach your model. Check it's running, the address is right, and that it allows this site (Ollama: set OLLAMA_ORIGINS=*). Browsers also block plain http:// calls from an https:// page — run the app locally or put your model behind https.",
      );
    }
    return error;
  }
  return new Error("Hermes could not be reached.");
}

async function request(settings: HermesSettings, path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(endpoint(settings, path), {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
      },
    });
  } catch (error) {
    throw friendly(error);
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    if (response.status === 404) throw new Error(`Model "${settings.model}" or this address was not found (404). ${body}`);
    throw new Error(`Hermes replied with ${response.status}: ${body}`);
  }
  return response;
}

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
    if (!text) throw new Error("Hermes returned an empty answer.");
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
  if (!full) throw new Error("Hermes returned an empty answer.");
  return full;
}

export async function hermesModels(settings: HermesSettings): Promise<string[]> {
  const response = await request(settings, "/models", { method: "GET" });
  const data = (await response.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((item) => item.id);
}

export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.search(/[[{]/);
  const end = Math.max(candidate.lastIndexOf("]"), candidate.lastIndexOf("}"));
  if (start === -1 || end === -1) throw new Error("Hermes did not return usable data.");
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
