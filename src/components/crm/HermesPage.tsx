import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Plug, Save, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace";
import { createLeads, updateLeadFields, type Lead, type NewLeadInput } from "@/lib/crm";
import {
  DEFAULT_HERMES,
  extractJson,
  hermesChat,
  hermesModels,
  loadHermes,
  saveHermes,
  type HermesSettings,
} from "@/lib/hermes";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./WorkspacePages";

type Suggestion = { username: string; full_name?: string; niche?: string; why?: string; instagram_url?: string; email?: string };
type Improvement = { username: string; niche?: string; score?: number; keep?: boolean; note?: string };

const inputClass = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30";

export function HermesPage() {
  const queryClient = useQueryClient();
  const { leads, workspace, workspaceLabel } = useWorkspace();
  const [settings, setSettings] = useState<HermesSettings>(() => loadHermes());
  const [status, setStatus] = useState<"unknown" | "ok" | "error">("unknown");
  const [busy, setBusy] = useState<string | null>(null);

  const [brief, setBrief] = useState("Instagram creators in the health and fitness niche with 10k–100k followers who sell no products yet.");
  const [count, setCount] = useState(15);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const uncurated = leads.filter((lead) => !lead.niche || !lead.match_note).slice(0, 25);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  async function guard(key: string, run: () => Promise<void>) {
    setBusy(key);
    try {
      await run();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hermes could not be reached.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    await guard("test", async () => {
      const models = await hermesModels(settings);
      setStatus("ok");
      toast.success(models.length ? `Connected. Models: ${models.slice(0, 4).join(", ")}` : "Connected to Hermes.");
    }).catch(() => setStatus("error"));
  }

  async function expand() {
    await guard("expand", async () => {
      const known = leads.slice(0, 40).map((lead) => lead.username).join(", ");
      const text = await hermesChat(settings, [
        { role: "system", content: "You help build Instagram outreach lists. Reply with JSON only." },
        { role: "user", content: `Suggest ${count} new Instagram creator leads for this brief: ${brief}\n\nAlready in the list (do not repeat): ${known}\n\nReturn a JSON array of objects with keys: username, full_name, niche, why.` },
      ]);
      const parsed = extractJson<Suggestion[]>(text).filter((item) => item?.username);
      setSuggestions(parsed);
      toast.success(`Hermes suggested ${parsed.length} leads`);
    });
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
    if (fresh.length === 0) return toast.error("Nothing new to add.");
    await guard("import", async () => {
      const added = await createLeads(fresh, workspace);
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      setSuggestions([]);
      toast.success(`${added} leads added to ${workspaceLabel}`);
    });
  }

  async function improve() {
    if (uncurated.length === 0) return toast.error("Every lead already has a niche and a note.");
    await guard("improve", async () => {
      const payload = uncurated.map((lead: Lead) => ({ username: lead.username, full_name: lead.full_name, niche: lead.niche, note: lead.match_note }));
      const text = await hermesChat(settings, [
        { role: "system", content: "You qualify Instagram outreach leads. Reply with JSON only." },
        { role: "user", content: `For each lead below, guess the best niche (Health, Wealth, Relationship or another single word), a score from 0 to 5 for how good an outreach fit they are, whether to keep them, and a one-sentence note.\n\nLeads: ${JSON.stringify(payload)}\n\nReturn a JSON array of objects with keys: username, niche, score, keep, note.` },
      ]);
      setImprovements(extractJson<Improvement[]>(text).filter((item) => item?.username));
      toast.success("Hermes finished reviewing");
    });
  }

  async function applyImprovements() {
    await guard("apply", async () => {
      let applied = 0;
      for (const item of improvements) {
        const match = uncurated.find((lead) => lead.username.toLowerCase().replace(/^@/, "") === item.username.toLowerCase().replace(/^@/, ""));
        if (!match) continue;
        await updateLeadFields(match.id, {
          niche: item.niche ?? match.niche,
          score: typeof item.score === "number" ? item.score : match.score,
          curation: item.keep === undefined ? match.curation : item.keep ? "KEEP" : "DELETE",
          match_note: item.note ?? match.match_note,
        });
        applied += 1;
      }
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      setImprovements([]);
      toast.success(`${applied} leads updated`);
    });
  }

  async function ask() {
    if (!question.trim()) return;
    await guard("ask", async () => {
      const summary = {
        workspace: workspaceLabel,
        total: leads.length,
        byStatus: leads.reduce<Record<string, number>>((acc, lead) => ({ ...acc, [lead.status]: (acc[lead.status] ?? 0) + 1 }), {}),
      };
      const text = await hermesChat(settings, [
        { role: "system", content: "You are an outreach assistant for a small team. Be concise and practical." },
        { role: "user", content: `Workspace snapshot: ${JSON.stringify(summary)}\n\n${question}` },
      ], { temperature: 0.6 });
      setAnswer(text);
    });
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 lg:px-6">
      <PageHeader title="Hermes AI" description={`Connect the Hermes model running on your computer and use it on the ${workspaceLabel} list.`} />

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2"><Plug className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Connection</h2>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${status === "ok" ? "bg-success-soft text-success" : status === "error" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>{status === "ok" ? "Connected" : status === "error" ? "Not reachable" : "Not tested"}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground">Address on your PC<input className={`${inputClass} mt-1`} value={settings.baseUrl} onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })} placeholder={DEFAULT_HERMES.baseUrl} /></label>
          <label className="text-xs text-muted-foreground">Model name<input className={`${inputClass} mt-1`} value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} placeholder="hermes3" /></label>
          <label className="text-xs text-muted-foreground">Key (optional)<input className={`${inputClass} mt-1`} value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} placeholder="Leave empty for local" /></label>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Your model stays on your computer — this page talks to it straight from your browser. If it refuses the connection, allow this site in your model server settings (for Ollama: set OLLAMA_ORIGINS to <code>*</code>).</p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => { saveHermes(settings); toast.success("Saved on this device"); }}><Save />Save</Button>
          <Button onClick={test} disabled={busy === "test"}>{busy === "test" ? <Loader2 className="animate-spin" /> : <Plug />}Test connection</Button>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2"><Sparkles className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Expand the list</h2></div>
          <textarea className="mt-3 min-h-24 w-full resize-none rounded-md border border-input bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring/30" value={brief} onChange={(event) => setBrief(event.target.value)} />
          <div className="mt-3 flex items-center gap-2">
            <input type="number" min={1} max={50} value={count} onChange={(event) => setCount(Number(event.target.value))} className={`${inputClass} w-24`} />
            <Button onClick={expand} disabled={busy === "expand"}>{busy === "expand" ? <Loader2 className="animate-spin" /> : <Wand2 />}Suggest leads</Button>
          </div>
          {suggestions.length > 0 ? <div className="mt-4">
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">{suggestions.map((item, index) => <div key={`${item.username}-${index}`} className="border-b border-border p-2.5 last:border-0"><p className="text-[13px] font-medium">@{item.username.replace(/^@/, "")}</p><p className="text-xs text-muted-foreground">{[item.full_name, item.niche].filter(Boolean).join(" · ")}</p>{item.why ? <p className="mt-1 text-xs text-muted-foreground">{item.why}</p> : null}</div>)}</div>
            <Button className="mt-3 w-full" onClick={importSuggestions} disabled={busy === "import"}>{busy === "import" ? <Loader2 className="animate-spin" /> : null}Add {suggestions.length} to {workspaceLabel}</Button>
          </div> : null}
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2"><Bot className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Improve existing leads</h2></div>
          <p className="mt-2 text-xs text-muted-foreground">{uncurated.length} leads in {workspaceLabel} are missing a niche or a note. Hermes can fill them in and score the fit.</p>
          <Button className="mt-3" onClick={improve} disabled={busy === "improve"}>{busy === "improve" ? <Loader2 className="animate-spin" /> : <Wand2 />}Review {uncurated.length} leads</Button>
          {improvements.length > 0 ? <div className="mt-4">
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">{improvements.map((item, index) => <div key={`${item.username}-${index}`} className="border-b border-border p-2.5 last:border-0"><p className="text-[13px] font-medium">@{item.username.replace(/^@/, "")}</p><p className="text-xs text-muted-foreground">{[item.niche, item.score !== undefined ? `score ${item.score}` : null, item.keep === false ? "suggest remove" : "suggest keep"].filter(Boolean).join(" · ")}</p>{item.note ? <p className="mt-1 text-xs text-muted-foreground">{item.note}</p> : null}</div>)}</div>
            <Button className="mt-3 w-full" onClick={applyImprovements} disabled={busy === "apply"}>{busy === "apply" ? <Loader2 className="animate-spin" /> : null}Apply to {improvements.length} leads</Button>
          </div> : null}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Ask Hermes about this list</h2>
        <div className="mt-3 flex gap-2">
          <input className={inputClass} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} placeholder="What should I focus on this week?" />
          <Button onClick={ask} disabled={busy === "ask"}>{busy === "ask" ? <Loader2 className="animate-spin" /> : null}Ask</Button>
        </div>
        {answer ? <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{answer}</p> : null}
      </section>
    </div>
  );
}
