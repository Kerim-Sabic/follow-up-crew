import { useEffect, useMemo, useState } from "react";
import { Copy, FileDown, Mail, RotateCcw, Shuffle, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace";
import { leadStage, type Lead } from "@/lib/crm";
import { EMAIL_SEQUENCE, SUBJECT_LINES } from "@/lib/email-templates";
import {
  hasEmail,
  loadSender,
  personalize,
  saveSender,
  withSignature,
  analyzeEmail,
  MAIL_CLIENTS,
  TOKENS,
  type SenderSettings,
} from "@/lib/email-outreach";
import { exportListKit } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./WorkspacePages";
import { EmailBatchDialog } from "./EmailBatchDialog";

const EDITS_KEY = "crm.template-edits";
const inputClass = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30";

function loadEdits(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(EDITS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

const SAMPLE_LEAD: Lead = {
  full_name: "Alex Rivera",
  username: "alex.fitness",
  niche: "Health",
} as Lead;

export function TemplatesPage() {
  const { leads, workspaceLabel } = useWorkspace();
  const [step, setStep] = useState(1);
  const [variant, setVariant] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>(() => loadEdits());
  const [editing, setEditing] = useState(false);
  const [sender, setSender] = useState<SenderSettings>(() => loadSender());
  const [subject, setSubject] = useState(SUBJECT_LINES[0] ?? "Quick idea");
  const [previewId, setPreviewId] = useState<string>("");
  const [batchOpen, setBatchOpen] = useState(false);

  const current = EMAIL_SEQUENCE.find((item) => item.step === step) ?? EMAIL_SEQUENCE[0]!;
  const key = `${step}:${variant}`;
  const original = current.variants[Math.min(variant, current.variants.length - 1)] ?? "";
  const body = edits[key] ?? original;

  const emailable = useMemo(() => leads.filter(hasEmail), [leads]);
  const ready = useMemo(() => emailable.filter((lead) => leadStage(lead) === "not_contacted"), [emailable]);
  const previewLead = useMemo(
    () => emailable.find((lead) => lead.id === previewId) ?? ready[0] ?? emailable[0] ?? SAMPLE_LEAD,
    [emailable, ready, previewId],
  );

  useEffect(() => { setEditing(false); }, [step, variant]);

  const rendered = withSignature(personalize(body, previewLead, sender), sender);
  const renderedSubject = personalize(subject, previewLead, sender);
  const words = rendered.trim().split(/\s+/).filter(Boolean).length;
  const readSeconds = Math.max(5, Math.round((words / 200) * 60));
  const missingTokens = /\{\{\s*[a-z_]+\s*\}\}/i.test(rendered);

  function saveEdit(next: string) {
    const updated = { ...edits, [key]: next };
    if (next.trim() === original.trim()) delete updated[key];
    setEdits(updated);
    window.localStorage.setItem(EDITS_KEY, JSON.stringify(updated));
  }

  function insertToken(token: string) {
    saveEdit(`${body}${body.endsWith(" ") ? "" : " "}${token}`);
    setEditing(true);
  }

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-5 lg:px-6">
      <PageHeader
        title="Templates"
        description={`The full 7-email sequence, personalised for every lead in ${workspaceLabel}.`}
        actions={<>
          <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(`${renderedSubject}\n\n${rendered}`); toast.success("Subject and email copied"); }}><Copy />Copy</Button>
          <Button variant="outline" onClick={() => { exportListKit(emailable, "listkit-leads.csv"); toast.success(`${emailable.length.toLocaleString()} leads exported for ListKit`); }}><FileDown />Export for ListKit</Button>
          <Button onClick={() => setBatchOpen(true)}><Mail />Email 10 leads</Button>
        </>}
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Leads with an email" value={emailable.length.toLocaleString()} />
        <Stat label="Ready to email now" value={ready.length.toLocaleString()} />
        <Stat label="Words in this email" value={`${words}`} />
        <Stat label="Reading time" value={`${readSeconds}s`} />
      </div>

      <ReplyCheck subject={renderedSubject} body={body} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
        <div className="space-y-1">
          {EMAIL_SEQUENCE.map((item) => (
            <button key={item.step} onClick={() => { setStep(item.step); setVariant(0); }} className={`w-full rounded-md border px-3 py-2 text-left text-[13px] ${item.step === step ? "border-primary/40 bg-secondary font-medium" : "border-border hover:bg-secondary/60"}`}>
              Email {item.step}
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">Reply keyword: {item.keyword}</span>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Email {current.step}</p>
              {edits[key] ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] text-warning">edited</span> : null}
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setVariant(Math.floor(Math.random() * current.variants.length))}><Shuffle />Random version</Button>
                <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((value) => !value)}>{editing ? "Done editing" : "Edit"}</Button>
                {edits[key] ? <Button size="sm" variant="ghost" onClick={() => saveEdit(original)}><RotateCcw />Reset</Button> : null}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{current.purpose}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {current.variants.map((_, index) => (
                <button key={index} onClick={() => setVariant(index)} className={`h-7 rounded-md border px-2.5 text-xs ${index === variant ? "border-primary/40 bg-secondary font-medium" : "border-border hover:bg-secondary/60"}`}>v{index + 1}</button>
              ))}
            </div>

            {editing ? <>
              <textarea className="mt-4 min-h-64 w-full resize-y rounded-md border border-input bg-card p-3 font-sans text-[13px] leading-6 outline-none focus:ring-2 focus:ring-ring/30" value={body} onChange={(event) => saveEdit(event.target.value)} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TOKENS.map((item) => <button key={item.token} onClick={() => insertToken(item.token)} className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-secondary/60" title={item.label}>{item.token}</button>)}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Your edits stay on this device and are used for every email you send from here.</p>
            </> : <div className="mt-4 rounded-md border border-border bg-secondary/30 p-4">
              <p className="text-xs text-muted-foreground">To: {previewLead.email ?? "lead@example.com"}</p>
              <p className="mt-1 text-[13px] font-medium">{renderedSubject}</p>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-[13px] leading-6">{rendered}</pre>
            </div>}

            {missingTokens ? <p className="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">This email still has a placeholder that didn't fill in — check the spelling of the {"{{"}token{"}}"}.</p> : null}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Subject lines</h2><span className="ml-auto text-xs text-muted-foreground">click to use</span></div>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {SUBJECT_LINES.map((line) => (
                <button key={line} onClick={() => { setSubject(line); toast.success("Subject selected"); }} className={`truncate rounded-md border px-2.5 py-1.5 text-left text-xs ${subject === line ? "border-primary/40 bg-secondary font-medium" : "border-border hover:bg-secondary/60"}`}>{line}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Your details</h2>
            <p className="mt-1 text-xs text-muted-foreground">Used to fill your name and sign-off. Kept on this device.</p>
            <label className="mt-3 block text-xs text-muted-foreground">Your name<input className={`${inputClass} mt-1`} value={sender.name} onChange={(event) => setSender({ ...sender, name: event.target.value })} placeholder="Kerim" /></label>
            <label className="mt-3 block text-xs text-muted-foreground">Sign-off (optional)<textarea className="mt-1 min-h-16 w-full resize-none rounded-md border border-input bg-card p-2 text-sm outline-none focus:ring-2 focus:ring-ring/30" value={sender.signature} onChange={(event) => setSender({ ...sender, signature: event.target.value })} placeholder="Kerim · DocMesKer" /></label>
            <label className="mt-3 block text-xs text-muted-foreground">Open drafts in
              <select className={`${inputClass} mt-1`} value={sender.client} onChange={(event) => setSender({ ...sender, client: event.target.value as SenderSettings["client"] })}>
                {MAIL_CLIENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <p className="mt-2 text-[11px] text-muted-foreground">{MAIL_CLIENTS.find((item) => item.value === sender.client)?.hint}</p>
            <Button className="mt-3 w-full" variant="outline" onClick={() => { saveSender(sender); toast.success("Saved"); }}>Save my details</Button>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Preview with</h2></div>
            <select className={`${inputClass} mt-3`} value={previewLead.id ?? ""} onChange={(event) => setPreviewId(event.target.value)}>
              {emailable.slice(0, 50).map((lead) => <option key={lead.id} value={lead.id}>{lead.full_name || `@${lead.username.replace(/^@/, "")}`}</option>)}
              {emailable.length === 0 ? <option value="">Example lead</option> : null}
            </select>
            <p className="mt-2 text-[11px] text-muted-foreground">The preview above shows exactly what this lead receives.</p>
            <Button className="mt-3 w-full" onClick={() => setBatchOpen(true)}><Mail />Email next 10 leads</Button>
          </div>
        </div>
      </div>

      <EmailBatchDialog open={batchOpen} onClose={() => setBatchOpen(false)} step={step} variant={variant} bodyOverride={edits[key]} subjectOverride={subject} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><strong className="mt-0.5 block text-lg tabular-nums">{value}</strong></div>;
}

function ReplyCheck({ subject, body }: { subject: string; body: string }) {
  const { checks, score } = analyzeEmail(subject, body);
  const tone = score >= 85 ? "text-success" : score >= 60 ? "text-warning" : "text-destructive";
  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Reply-rate check</h2>
        <span className={`text-sm font-semibold tabular-nums ${tone}`}>{score}%</span>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 size-2 shrink-0 rounded-full ${check.ok ? "bg-success" : "bg-warning"}`} />
            <span>
              <span className="font-medium">{check.label}</span>
              {check.ok ? null : <span className="block text-muted-foreground">{check.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
