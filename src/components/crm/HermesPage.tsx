import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Bot, CircleStop, Loader2, Plug, Save, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace";
import { leadStage, createLeads, updateLeadFields, type Lead, type NewLeadInput } from "@/lib/crm";
import {
  DEFAULT_HERMES,
  extractJson,
  hermesChat,
  hermesTestConnection,
  loadHermes,
  parsePartialObjects,
  saveHermes,
  type HermesSettings,
} from "@/lib/hermes";

import { Button } from "@/components/ui/button";
import { PageHeader } from "./WorkspacePages";

type Suggestion = { username: string; full_name?: string; niche?: string; why?: string; instagram_url?: string; email?: string };
type Improvement = { username: string; niche?: string; score?: number; keep?: boolean; note?: string };
type Progress = { label: string; done: number; total: number } | null;
type LogLine = { time: string; text: string; kind: "info" | "ok" | "warn" | "error" };
type Live = { task: string; detail: string; startedAt: number; chars: number } | null;

const inputClass = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30";
const REVIEW_CHUNK = 8;

function ProgressBar({ progress }: { progress: Progress }) {
  if (!progress) return null;
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>{progress.label}</span><span className="tabular-nums">{progress.done}/{progress.total} · {percent}%</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

function LiveStrip({ live, now }: { live: Live; now: number }) {
  if (!live) return null;
  const seconds = Math.max(0, (now - live.startedAt) / 1000);
  const rate = seconds > 0.4 ? Math.round(live.chars / seconds) : 0;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5 font-medium text-foreground"><Activity className="size-3.5 animate-pulse text-primary" />{live.task}</span>
      {live.detail ? <span>{live.detail}</span> : null}
      <span className="tabular-nums">{seconds.toFixed(1)}s</span>
      {live.chars ? <span className="tabular-nums">{live.chars} characters{rate ? ` · ${rate}/s` : ""}</span> : null}
    </div>
  );
}

export function HermesPage() {
  const queryClient = useQueryClient();
  const { leads, workspace, workspaceLabel } = useWorkspace();
  const [settings, setSettings] = useState<HermesSettings>(() => loadHermes());
  const [status, setStatus] = useState<"unknown" | "ok" | "error">("unknown");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [live, setLive] = useState<Live>(null);
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const [brief, setBrief] = useState("Instagram creators in the health and fitness niche with 10k–100k followers who sell no products yet.");
  const [count, setCount] = useState(15);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const uncurated = leads.filter((lead) => !lead.niche || !lead.match_note).slice(0, 40);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [live]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  function note(text: string, kind: LogLine["kind"] = "info") {
    setLog((current) => [...current.slice(-60), { time: new Date().toLocaleTimeString(), text, kind }]);
  }

  function startLive(task: string, detail = "") {
    setLive({ task, detail, startedAt: Date.now(), chars: 0 });
  }
  function liveDetail(detail: string) {
    setLive((current) => (current ? { ...current, detail } : current));
  }
  function liveChars(chars: number) {
    setLive((current) => (current ? { ...current, chars } : current));
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(null);
    setProgress(null);
    setLive(null);
    note("Stopped by you.", "warn");
  }

  async function guard(key: string, run: (signal: AbortSignal) => Promise<void>) {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(key);
    try {
      await run(controller.signal);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Hermes could not be reached.";
      note(message, "error");
      toast.error(message);
      throw error;
    } finally {
      abortRef.current = null;
      setBusy(null);
      setProgress(null);
      setLive(null);
    }
  }

  async function test() {
    note("Testing connection…");
    startLive("Testing connection", settings.baseUrl);
    setBusy("test");
    try {
      const result = await hermesTestConnection(settings);
      setModels(result.models);
      setLatency(result.latencyMs || null);
      setStatus(result.ok ? "ok" : "error");
      setBlocked(result.kind === "local-network-denied");
      note(result.message, result.ok ? "ok" : "error");
      if (result.ok) toast.success(result.message); else toast.error(result.message);
      if (result.models.length) note(`Models on your machine: ${result.models.join(", ")}`);
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "Hermes could not be reached.";
      note(message, "error");
      toast.error(message);
    } finally {
      setBusy(null);
      setLive(null);
    }
  }

  /** Run a prompt and stream complete JSON objects out as they arrive. */
  async function streamObjects<T>(
    prompt: { system: string; user: string },
    signal: AbortSignal,
    onPartial: (items: T[], chars: number) => void,
  ): Promise<T[]> {
    let text = "";
    text = await hermesChat(settings, [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ], {
      signal,
      onToken: (_chunk, full) => onPartial(parsePartialObjects<T>(full), full.length),
    });
    try {
      return extractJson<T[]>(text);
    } catch {
      const salvaged = parsePartialObjects<T>(text);
      if (salvaged.length) {
        note("Answer wasn't clean JSON — recovered what I could.", "warn");
        return salvaged;
      }
      throw new Error("Hermes did not return usable data. Try lowering the number or rephrasing the brief.");
    }
  }

  async function expand() {
    setSuggestions([]);
    await guard("expand", async (signal) => {
      const known = leads.slice(0, 40).map((lead) => lead.username).join(", ");
      note(`Asking Hermes for ${count} new leads…`);
      startLive("Writing suggestions", `${settings.model}`);
      setProgress({ label: "Hermes is writing suggestions", done: 0, total: count });
      const parsed = await streamObjects<Suggestion>({
        system: "You help build Instagram outreach lists. Reply with a JSON array only, no prose.",
        user: `Suggest ${count} new Instagram creator leads for this brief: ${brief}\n\nAlready in the list (do not repeat): ${known}\n\nReturn a JSON array of objects with keys: username, full_name, niche, why.`,
      }, signal, (items, chars) => {
        liveChars(chars);
        liveDetail(`${items.length} of ${count} written`);
        setSuggestions(items.filter((item) => item?.username));
        setProgress({ label: "Hermes is writing suggestions", done: Math.min(items.length, count), total: count });
      });
      const clean = parsed.filter((item) => item?.username);
      setSuggestions(clean);
      note(`Received ${clean.length} suggestions.`, "ok");
      toast.success(`Hermes suggested ${clean.length} leads`);
    }).catch(() => undefined);
  }

  async function importSuggestions() {
    const existing = new Set(leads.map((lead) => lead.username.toLowerCase().replace(/^@/, "")));
    const fresh: NewLeadInput[] = suggestions
      .filter((item) => !existing.has(item.username.toLowerCase().replace(/^@/, "")))
      .map((item) => ({
        username: item.username,
        full_name: item.full_name ?? null,
        niche: item.niche ?? null,
        email: item.email ?? null,
        instagram_url: item.instagram_url ?? null,
        match_note: item.why ?? null,
      }));
    if (fresh.length === 0) { toast.error("Nothing new to add — they're all already on the list."); return; }
    await guard("import", async () => {
      startLive("Adding leads", `${fresh.length} new to ${workspaceLabel}`);
      const added = await createLeads(fresh, workspace);
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      setSuggestions([]);
      note(`${added} leads added to ${workspaceLabel}.`, "ok");
      toast.success(`${added} leads added to ${workspaceLabel}`);
    }).catch(() => undefined);
  }

  async function improve() {
    if (uncurated.length === 0) { toast.error("Every lead already has a niche and a note."); return; }
    setImprovements([]);
    await guard("improve", async (signal) => {
      const collected: Improvement[] = [];
      const chunks: Lead[][] = [];
      for (let i = 0; i < uncurated.length; i += REVIEW_CHUNK) chunks.push(uncurated.slice(i, i + REVIEW_CHUNK));
      note(`Reviewing ${uncurated.length} leads in ${chunks.length} batches…`);
      setProgress({ label: "Reviewing leads", done: 0, total: uncurated.length });
      startLive("Reviewing leads", `batch 1 of ${chunks.length}`);
      for (const [chunkIndex, chunk] of chunks.entries()) {
        liveDetail(`batch ${chunkIndex + 1} of ${chunks.length} · ${chunk.map((lead) => `@${lead.username.replace(/^@/, "")}`).slice(0, 3).join(", ")}…`);
        const payload = chunk.map((lead) => ({ username: lead.username, full_name: lead.full_name, niche: lead.niche, note: lead.match_note }));
        try {
          const parsed = await streamObjects<Improvement>({
            system: "You qualify Instagram outreach leads. Reply with a JSON array only, no prose.",
            user: `For each lead below, guess the best niche (Health, Wealth, Relationship or another single word), a score from 0 to 5 for how good an outreach fit they are, whether to keep them, and a one-sentence note.\n\nLeads: ${JSON.stringify(payload)}\n\nReturn a JSON array of objects with keys: username, niche, score, keep, note.`,
          }, signal, (items, chars) => {
            liveChars(chars);
            setImprovements([...collected, ...items.filter((item) => item?.username)]);
          });
          const clean = parsed.filter((item) => item?.username);
          collected.push(...clean);
          setImprovements([...collected]);
          note(`Batch ${chunkIndex + 1}: ${clean.length} leads reviewed.`, "ok");
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") throw error;
          note(`Batch ${chunkIndex + 1} came back unreadable — skipped.`, "warn");
          setImprovements([...collected]);
        }
        const done = Math.min((chunkIndex + 1) * REVIEW_CHUNK, uncurated.length);
        setProgress({ label: "Reviewing leads", done, total: uncurated.length });
      }
      note(`Done — ${collected.length} suggestions ready to apply.`, "ok");
      toast.success(`Hermes reviewed ${collected.length} leads`);
    }).catch(() => undefined);
  }

  async function applyImprovements() {
    await guard("apply", async () => {
      let applied = 0;
      startLive("Saving changes", `${improvements.length} leads`);
      setProgress({ label: "Saving changes", done: 0, total: improvements.length });
      for (const [i, item] of improvements.entries()) {
        const match = uncurated.find((lead) => lead.username.toLowerCase().replace(/^@/, "") === item.username.toLowerCase().replace(/^@/, ""));
        if (match) {
          await updateLeadFields(match.id, {
            niche: item.niche ?? match.niche,
            score: typeof item.score === "number" ? item.score : match.score,
            curation: item.keep === undefined ? match.curation : item.keep ? "KEEP" : "DELETE",
            match_note: item.note ?? match.match_note,
          });
          applied += 1;
        }
        liveDetail(`@${item.username.replace(/^@/, "")}`);
        setProgress({ label: "Saving changes", done: i + 1, total: improvements.length });
      }
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      setImprovements([]);
      note(`${applied} leads updated.`, "ok");
      toast.success(`${applied} leads updated`);
    }).catch(() => undefined);
  }

  async function ask() {
    if (!question.trim()) return;
    setAnswer("");
    await guard("ask", async (signal) => {
      const summary = {
        workspace: workspaceLabel,
        total: leads.length,
        byStatus: leads.reduce<Record<string, number>>((acc, lead) => ({ ...acc, [leadStage(lead)]: (acc[leadStage(lead)] ?? 0) + 1 }), {}),
      };
      note("Asking Hermes about this list…");
      startLive("Thinking", settings.model);
      await hermesChat(settings, [
        { role: "system", content: "You are an outreach assistant for a small team. Be concise and practical." },
        { role: "user", content: `Workspace snapshot: ${JSON.stringify(summary)}\n\n${question}` },
      ], { temperature: 0.6, signal, onToken: (_chunk, full) => { setAnswer(full); liveChars(full.length); liveDetail("writing the answer"); } });
      note("Answer complete.", "ok");
    }).catch(() => undefined);
  }

  const logColor: Record<LogLine["kind"], string> = {
    info: "text-muted-foreground",
    ok: "text-success",
    warn: "text-warning",
    error: "text-destructive",
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 lg:px-6">
      <PageHeader title="Hermes AI" description={`Connect the Hermes model running on your computer and use it on the ${workspaceLabel} list.`} />

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2"><Plug className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Connection</h2>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${status === "ok" ? "bg-success-soft text-success" : status === "error" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>{status === "ok" ? `Connected${latency !== null ? ` · ${latency} ms` : ""}` : status === "error" ? "Not reachable" : "Not tested"}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground">Address on your PC<input className={`${inputClass} mt-1`} value={settings.baseUrl} onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })} placeholder={DEFAULT_HERMES.baseUrl} /></label>
          <label className="text-xs text-muted-foreground">Model name<input className={`${inputClass} mt-1`} value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} placeholder={DEFAULT_HERMES.model} list="hermes-models" /><datalist id="hermes-models">{models.map((model) => <option key={model} value={model} />)}</datalist></label>
          <label className="text-xs text-muted-foreground">Key (optional)<input className={`${inputClass} mt-1`} type="password" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} placeholder="Leave empty for local" /></label>
        </div>
        {models.length ? <div className="mt-3 flex flex-wrap gap-1.5">{models.slice(0, 12).map((model) => <button key={model} onClick={() => setSettings({ ...settings, model })} className={`rounded-md border px-2 py-1 text-[11px] ${settings.model === model ? "border-primary bg-accent" : "border-border hover:bg-secondary"}`}>{model}</button>)}</div> : null}
        <p className="mt-3 text-xs text-muted-foreground">Hermes stays on your computer — this page talks to it straight from your browser, never through a server. Your key is kept on this device only.</p>
        {blocked ? <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">Local network access is blocked. Allow Local Network Access for this site in your browser settings, then retry.</div> : null}
        {helpOpen ? <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">Chrome / Chromium</p>
          <p>Click the icon left of the address bar → Site settings → Local network access → Allow. Then press Test connection again — no page reload needed.</p>
          <p className="mt-2">If Chrome shows a permission prompt when you press Test connection, choose Allow.</p>
        </div> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => { saveHermes(settings); toast.success("Saved on this device"); }}><Save />Save</Button>
          <Button onClick={test} disabled={busy === "test"}>{busy === "test" ? <Loader2 className="animate-spin" /> : <Plug />}Test connection</Button>
          <button type="button" onClick={() => setHelpOpen((open) => !open)} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">Browser permission help</button>
          {busy ? <Button variant="ghost" onClick={stop}><CircleStop />Stop</Button> : null}
        </div>
        <LiveStrip live={live} now={now} />
        <ProgressBar progress={progress} />
        {log.length ? <div ref={logRef} className="mt-4 max-h-40 overflow-y-auto rounded-md border border-border bg-secondary/40 p-2 font-mono text-[11px] leading-5">{log.map((line, index) => <p key={index} className={logColor[line.kind]}><span className="opacity-60">{line.time}</span> · {line.text}</p>)}</div> : null}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2"><Sparkles className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Expand the list</h2>{busy === "expand" ? <span className="ml-auto text-[11px] text-primary">working…</span> : null}</div>
          <textarea className="mt-3 min-h-24 w-full resize-none rounded-md border border-input bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring/30" value={brief} onChange={(event) => setBrief(event.target.value)} />
          <div className="mt-3 flex items-center gap-2">
            <input type="number" min={1} max={50} value={count} onChange={(event) => setCount(Number(event.target.value))} className={`${inputClass} w-24`} />
            <Button onClick={expand} disabled={Boolean(busy)}>{busy === "expand" ? <Loader2 className="animate-spin" /> : <Wand2 />}Suggest leads</Button>
            {busy === "expand" ? <Button variant="ghost" onClick={stop}><CircleStop />Stop</Button> : null}
          </div>
          {suggestions.length > 0 ? <div className="mt-4">
            <p className="mb-2 text-[11px] text-muted-foreground">{suggestions.length} suggestions{busy === "expand" ? " so far" : ""}</p>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">{suggestions.map((item, index) => <div key={`${item.username}-${index}`} className="border-b border-border p-2.5 last:border-0"><p className="text-[13px] font-medium">@{item.username.replace(/^@/, "")}</p><p className="text-xs text-muted-foreground">{[item.full_name, item.niche].filter(Boolean).join(" · ")}</p>{item.why ? <p className="mt-1 text-xs text-muted-foreground">{item.why}</p> : null}</div>)}</div>
            <Button className="mt-3 w-full" onClick={importSuggestions} disabled={Boolean(busy)}>{busy === "import" ? <Loader2 className="animate-spin" /> : null}Add {suggestions.length} to {workspaceLabel}</Button>
          </div> : null}
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2"><Bot className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Improve existing leads</h2>{busy === "improve" ? <span className="ml-auto text-[11px] text-primary">working…</span> : null}</div>
          <p className="mt-2 text-xs text-muted-foreground">{uncurated.length} leads in {workspaceLabel} are missing a niche or a note. Hermes reviews them in batches of {REVIEW_CHUNK} so you see progress as it goes.</p>
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={improve} disabled={Boolean(busy)}>{busy === "improve" ? <Loader2 className="animate-spin" /> : <Wand2 />}Review {uncurated.length} leads</Button>
            {busy === "improve" ? <Button variant="ghost" onClick={stop}><CircleStop />Stop</Button> : null}
          </div>
          {improvements.length > 0 ? <div className="mt-4">
            <p className="mb-2 text-[11px] text-muted-foreground">{improvements.length} reviewed{busy === "improve" ? " so far" : ""}</p>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">{improvements.map((item, index) => <div key={`${item.username}-${index}`} className="border-b border-border p-2.5 last:border-0"><p className="text-[13px] font-medium">@{item.username.replace(/^@/, "")}</p><p className="text-xs text-muted-foreground">{[item.niche, item.score !== undefined ? `score ${item.score}` : null, item.keep === false ? "suggest remove" : "suggest keep"].filter(Boolean).join(" · ")}</p>{item.note ? <p className="mt-1 text-xs text-muted-foreground">{item.note}</p> : null}</div>)}</div>
            <Button className="mt-3 w-full" onClick={applyImprovements} disabled={Boolean(busy)}>{busy === "apply" ? <Loader2 className="animate-spin" /> : null}Apply to {improvements.length} leads</Button>
          </div> : null}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Ask Hermes about this list</h2>
        <div className="mt-3 flex gap-2">
          <input className={inputClass} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} placeholder="What should I focus on this week?" />
          <Button onClick={ask} disabled={Boolean(busy)}>{busy === "ask" ? <Loader2 className="animate-spin" /> : null}Ask</Button>
          {busy === "ask" ? <Button variant="ghost" onClick={stop}><CircleStop />Stop</Button> : null}
        </div>
        {answer ? <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{answer}{busy === "ask" ? <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-muted-foreground align-middle" /> : null}</p> : null}
      </section>
    </div>
  );
}
