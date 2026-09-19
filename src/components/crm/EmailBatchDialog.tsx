import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useOptimisticStage, useWorkspace } from "@/lib/workspace";
import { addNote, leadStage, updateLeadStatus, type Lead } from "@/lib/crm";
import { EMAIL_SEQUENCE, SUBJECT_LINES } from "@/lib/email-templates";
import {
  composeUrl,
  emailedToday,
  hasEmail,
  loadSender,
  openCompose,
  personalize,
  rememberEmailed,
  saveSender,
  withSignature,
  MAIL_CLIENTS,
  type SenderSettings,
} from "@/lib/email-outreach";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const inputClass = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30";

export function EmailBatchDialog({
  open,
  onClose,
  step: initialStep = 1,
  variant: initialVariant = 0,
  bodyOverride,
  subjectOverride,
}: {
  open: boolean;
  onClose: () => void;
  step?: number;
  variant?: number;
  bodyOverride?: string;
  subjectOverride?: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { leads, workspaceLabel } = useWorkspace();
  const optimistic = useOptimisticStage();

  const [sender, setSender] = useState<SenderSettings>(() => loadSender());
  const [count, setCount] = useState(10);
  const [step, setStep] = useState(initialStep);
  const [variant, setVariant] = useState(initialVariant);
  const [rotate, setRotate] = useState(true);
  const [subject, setSubject] = useState(subjectOverride ?? SUBJECT_LINES[0] ?? "Quick idea");
  const [opened, setOpened] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [skipEmailedToday, setSkipEmailedToday] = useState(true);

  const template = EMAIL_SEQUENCE.find((item) => item.step === step) ?? EMAIL_SEQUENCE[0]!;
  const alreadyToday = useMemo(() => new Set(skipEmailedToday ? emailedToday() : []), [skipEmailedToday, open]);

  const batch = useMemo(() => {
    return leads
      .filter((lead) => hasEmail(lead) && leadStage(lead) === "not_contacted" && !alreadyToday.has(lead.id))
      .slice(0, count);
  }, [leads, count, alreadyToday]);

  const withEmailTotal = leads.filter(hasEmail).length;

  function draftFor(lead: Lead, index: number) {
    const source = bodyOverride ?? template.variants[rotate ? index % template.variants.length : Math.min(variant, template.variants.length - 1)] ?? "";
    const body = withSignature(personalize(source, lead, sender), sender);
    return { subject: personalize(subject, lead, sender), body };
  }

  function openOne(lead: Lead, index: number) {
    const { subject: line, body } = draftFor(lead, index);
    openCompose(composeUrl(lead.email ?? "", line, body, sender.client), sender.client);
    setOpened((current) => (current.includes(lead.id) ? current : [...current, lead.id]));
  }

  function openAll() {
    if (sender.client === "default") {
      toast.info("Your mail app opens one draft at a time — click each lead below, or switch to Gmail or Outlook to open all at once.");
      openOne(batch[0]!, 0);
      return;
    }
    batch.forEach((lead, index) => window.setTimeout(() => openOne(lead, index), index * 350));
    toast.success(`Opening ${batch.length} drafts — allow pop-ups if your browser asks.`);
  }

  async function finish() {
    const done = batch.filter((lead) => opened.includes(lead.id));
    if (done.length === 0) { toast.error("Open at least one draft first."); return; }
    setSaving(true);
    try {
      const ids = done.map((lead) => lead.id);
      optimistic(ids, "contacted", user?.id ?? "");
      await updateLeadStatus(ids, "contacted", user?.id ?? "");
      if (user?.id) {
        await Promise.all(done.map((lead, index) => addNote(lead.id, user.id, `Emailed (${bodyOverride ? "custom" : `sequence step ${step}`}): ${draftFor(lead, index).subject}`)));
      }
      rememberEmailed(ids);
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`${done.length} leads emailed and marked contacted`);
      setOpened([]);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the batch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Email a batch of leads</DialogTitle>
          <DialogDescription>{withEmailTotal.toLocaleString()} leads in {workspaceLabel} have an email address. Each one gets its own personalised draft in your mail app.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground">Your name<input className={`${inputClass} mt-1`} value={sender.name} onChange={(event) => setSender({ ...sender, name: event.target.value })} placeholder="Kerim" /></label>
          <label className="text-xs text-muted-foreground">How many<input type="number" min={1} max={50} className={`${inputClass} mt-1`} value={count} onChange={(event) => setCount(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} /></label>
          <label className="text-xs text-muted-foreground">Send from
            <select className={`${inputClass} mt-1`} value={sender.client} onChange={(event) => setSender({ ...sender, client: event.target.value as SenderSettings["client"] })}>
              {MAIL_CLIENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">Sequence email
            <select className={`${inputClass} mt-1`} value={step} onChange={(event) => { setStep(Number(event.target.value)); setVariant(0); }} disabled={Boolean(bodyOverride)}>
              {EMAIL_SEQUENCE.map((item) => <option key={item.step} value={item.step}>Email {item.step} — reply {item.keyword}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Subject
            <input className={`${inputClass} mt-1`} value={subject} onChange={(event) => setSubject(event.target.value)} list="subject-lines" />
            <datalist id="subject-lines">{SUBJECT_LINES.map((line) => <option key={line} value={line} />)}</datalist>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <label className="flex items-center gap-2"><input type="checkbox" checked={rotate} onChange={(event) => setRotate(event.target.checked)} disabled={Boolean(bodyOverride)} />Rotate wording between leads (avoids spam filters)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={skipEmailedToday} onChange={(event) => setSkipEmailedToday(event.target.checked)} />Skip anyone already emailed today</label>
        </div>

        {batch.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No uncontacted leads with an email address left for this batch.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            {batch.map((lead, index) => {
              const draft = draftFor(lead, index);
              const done = opened.includes(lead.id);
              return (
                <div key={lead.id} className="flex items-start gap-3 border-b border-border p-3 last:border-0">
                  <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] ${done ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground"}`}>{done ? <Check className="size-3" /> : index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{lead.full_name || `@${lead.username.replace(/^@/, "")}`} <span className="font-normal text-muted-foreground">· {lead.email}</span></p>
                    <p className="truncate text-xs text-muted-foreground">{draft.subject}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{draft.body.split("\n").filter(Boolean)[0]}</p>
                  </div>
                  <Button size="sm" variant={done ? "outline" : "default"} onClick={() => openOne(lead, index)}><Mail />{done ? "Reopen" : "Open draft"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`); toast.success("Copied"); }}><Copy /></Button>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">{opened.length} of {batch.length} drafts opened</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { saveSender(sender); toast.success("Saved on this device"); }}>Save my details</Button>
            <Button variant="outline" onClick={openAll} disabled={batch.length === 0}><Send />Open all {batch.length}</Button>
            <Button onClick={finish} disabled={saving || opened.length === 0}>{saving ? <Loader2 className="animate-spin" /> : <Check />}Mark {opened.length} contacted</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
