import type { Lead } from "./crm";

export type MailClient = "default" | "gmail" | "outlook";

export type SenderSettings = {
  name: string;
  email: string;
  client: MailClient;
  signature: string;
};

const SENDER_KEY = "crm.sender";
const EMAILED_KEY = "crm.emailed-today";

export const DEFAULT_SENDER: SenderSettings = { name: "", email: "", client: "default", signature: "" };

export const MAIL_CLIENTS: { value: MailClient; label: string; hint: string }[] = [
  { value: "default", label: "My mail app", hint: "Opens Apple Mail, Outlook desktop or whatever handles email on this computer." },
  { value: "gmail", label: "Gmail in browser", hint: "Opens a Gmail compose window in a new tab." },
  { value: "outlook", label: "Outlook on the web", hint: "Opens an Outlook compose window in a new tab." },
];

export function loadSender(): SenderSettings {
  if (typeof window === "undefined") return DEFAULT_SENDER;
  try {
    const raw = window.localStorage.getItem(SENDER_KEY);
    return raw ? { ...DEFAULT_SENDER, ...(JSON.parse(raw) as Partial<SenderSettings>) } : DEFAULT_SENDER;
  } catch {
    return DEFAULT_SENDER;
  }
}

export function saveSender(settings: SenderSettings) {
  window.localStorage.setItem(SENDER_KEY, JSON.stringify(settings));
}

/** Lead ids already emailed today, so a second batch never repeats anyone. */
export function emailedToday(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EMAILED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { date: string; ids: string[] };
    return parsed.date === new Date().toDateString() ? parsed.ids : [];
  } catch {
    return [];
  }
}

export function rememberEmailed(ids: string[]) {
  const merged = Array.from(new Set([...emailedToday(), ...ids])).slice(-1000);
  window.localStorage.setItem(EMAILED_KEY, JSON.stringify({ date: new Date().toDateString(), ids: merged }));
}

export const TOKENS: { token: string; label: string }[] = [
  { token: "{{first_name}}", label: "Lead first name" },
  { token: "{{full_name}}", label: "Lead full name" },
  { token: "{{username}}", label: "Instagram handle" },
  { token: "{{niche}}", label: "Niche" },
  { token: "{{sender_first_name}}", label: "Your first name" },
  { token: "{{sender_name}}", label: "Your full name" },
];

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

export function leadFirstName(lead: Pick<Lead, "full_name" | "username">) {
  const full = (lead.full_name ?? "").trim();
  if (full) return titleCase(full.split(/\s+/)[0] ?? full);
  const handle = lead.username.replace(/^@/, "").replace(/[._\-0-9]+/g, " ").trim();
  const first = handle.split(/\s+/)[0] ?? handle;
  return first ? titleCase(first) : "there";
}

export function personalize(
  text: string,
  lead: Pick<Lead, "full_name" | "username" | "niche">,
  sender: SenderSettings,
) {
  const senderName = sender.name.trim() || "Me";
  const values: Record<string, string> = {
    first_name: leadFirstName(lead),
    full_name: (lead.full_name ?? "").trim() || leadFirstName(lead),
    username: `@${lead.username.replace(/^@/, "")}`,
    niche: (lead.niche ?? "").trim() || "your niche",
    sender_first_name: senderName.split(/\s+/)[0] ?? senderName,
    sender_name: senderName,
  };
  return text
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => values[key.toLowerCase()] ?? match)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .trimStart();
}

export function withSignature(body: string, sender: SenderSettings) {
  const signature = sender.signature.trim();
  return signature ? `${body.trimEnd()}\n\n${signature}` : body;
}

/** Builds the compose URL for the chosen mail app. */
export function composeUrl(to: string, subject: string, body: string, client: MailClient) {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  if (client === "gmail") {
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodedSubject}&body=${encodedBody}`;
  }
  if (client === "outlook") {
    return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodedSubject}&body=${encodedBody}`;
  }
  return `mailto:${encodeURIComponent(to)}?subject=${encodedSubject}&body=${encodedBody}`;
}

export function openCompose(url: string, client: MailClient) {
  if (client === "default") {
    // A real anchor click keeps the page in place and hands the draft to the
    // desktop mail app, unlike window.open which some browsers block.
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function hasEmail(lead: Lead) {
  return Boolean(lead.email && /.+@.+\..+/.test(lead.email));
}

// ---------- reply-rate coaching ----------

export type EmailCheck = { ok: boolean; label: string; hint: string };

const SPAM_WORDS = ["guarantee", "free", "risk-free", "buy now", "limited time", "act now", "100%", "cheap", "click here", "offer expires"];

/** Honest heuristics from cold-email best practice — no fake predictions. */
export function analyzeEmail(subject: string, body: string): { checks: EmailCheck[]; score: number } {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const subjectWords = subject.trim().split(/\s+/).filter(Boolean).length;
  const lower = `${subject} ${body}`.toLowerCase();
  const spam = SPAM_WORDS.filter((word) => lower.includes(word));
  const links = (body.match(/https?:\/\//g) ?? []).length;
  const questions = (body.match(/\?/g) ?? []).length;

  const checks: EmailCheck[] = [
    { ok: words >= 40 && words <= 140, label: `${words} words`, hint: "Short emails get the most replies — aim for 40–140 words." },
    { ok: subjectWords > 0 && subjectWords <= 5, label: `Subject: ${subjectWords} words`, hint: "Keep subjects to 5 words or fewer so they survive mobile inboxes." },
    { ok: /\{\{\s*(first_name|full_name|username|niche)\s*\}\}/i.test(body), label: "Personalised", hint: "Use a token like {{first_name}} or {{niche}} so each email feels written for them." },
    { ok: questions >= 1, label: questions ? `${questions} question${questions === 1 ? "" : "s"}` : "No question", hint: "End with one easy question — a clear ask is the biggest reply driver." },
    { ok: links === 0, label: links ? `${links} link${links === 1 ? "" : "s"}` : "No links", hint: "Links in a first email hurt deliverability. Save them for the reply." },
    { ok: spam.length === 0, label: spam.length ? `Spam words: ${spam.join(", ")}` : "No spam words", hint: "Swap salesy wording for plain language." },
    { ok: body.split(/\n\s*\n/).filter(Boolean).length >= 2, label: "Easy to skim", hint: "Break the email into short paragraphs." },
  ];
  const passed = checks.filter((check) => check.ok).length;
  return { checks, score: Math.round((passed / checks.length) * 100) };
}
