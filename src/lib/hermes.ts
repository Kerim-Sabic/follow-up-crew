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

export async function hermesChat(
  settings: HermesSettings,
  messages: HermesMessage[],
  options?: { temperature?: number; signal?: AbortSignal },
): Promise<string> {
  const response = await fetch(endpoint(settings, "/chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: options?.temperature ?? 0.4,
      stream: false,
    }),
    ...(options?.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`Hermes replied with ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Hermes returned an empty answer.");
  return text;
}

export async function hermesModels(settings: HermesSettings): Promise<string[]> {
  const response = await fetch(endpoint(settings, "/models"), {
    headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
  });
  if (!response.ok) throw new Error(`Could not reach Hermes (${response.status}).`);
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
