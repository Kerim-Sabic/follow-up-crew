import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { creatorCommand } from "@/lib/creator.functions";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import {
  checkDraft,
  compileBrief,
  qualify,
  type MissionSpec,
  type Observation,
} from "@/lib/mission-domain";
import { Button } from "@/components/ui/button";
import { TeamManagement } from "./TeamManagement";
import { LocalHermes } from "./LocalHermes";
import { EvidenceReview } from "./EvidenceReview";
import { DraftEditor } from "./DraftEditor";
import { PartnershipOperations } from "./PartnershipOperations";
import { ProviderSetup } from "./ProviderSetup";
import { UsageLedger, type UsageAttempt, type UsageGroup } from "./UsageLedger";
import { invitationHash, rpc } from "@/lib/creator-api";
import { nanosToUsd, usdToNanos } from "@/lib/money";
import { projectMissionCost } from "@/lib/mission-cost";

type Overview = {
  founders: {
    email: string;
    verified: boolean;
    member: boolean;
    role: string;
    developer: boolean;
  }[];
  role: string;
  developer: boolean;
  missions: {
    id: string;
    spec: MissionSpec;
    state: string;
    checkpoint: number;
    problem: string | null;
    plan_hash: string;
    use_ai: boolean;
  }[];
  drafts: {
    id: string;
    lead_id: string;
    preference_matches: number;
    username: string;
    body: string;
    state: string;
    observation: Observation;
    spec: MissionSpec;
    opportunity: Record<string, unknown>;
  }[];
  evidence: {
    id: string;
    lead_id: string;
    mission_id: string;
    username: string;
    qualification: string;
    reasons: string[];
    observation: Observation;
  }[];
  providers: {
    provider: string;
    fingerprint: string;
    models: string[];
    rights_confirmed: boolean;
    validated_at: string | null;
    configuration: Record<string, unknown>;
  }[];
  usage: UsageGroup[];
  attempts: UsageAttempt[];
  feedback: { topic: string; decision: string; reason: string }[];
  replies: { id: string; subject: string }[];
  followups: { id: string; username: string; last_touched_at: string }[];
  approvedDrafts: { id: string; username: string; approved_at: string }[];
  proposals: {
    id: string;
    lead_id: string;
    title: string;
    public_content: string;
    version: number;
  }[];
  projects: {
    id: string;
    agreed_scope: string;
    validation_task: string;
    state: string;
    agreed_terms: string;
  }[];
  limits: { daily_nanos: string; monthly_nanos: string; research_enabled: boolean }[];
  preferences: {
    id: string;
    reason: string;
    preferences: { topics: string[]; avoidTopics?: string[] };
  }[];
};
type EvidenceMatch = {
  id: string;
  leadId: string;
  username: string;
  qualification: string;
  observation: Observation;
  reasons: string[];
};
const field = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm";
const defaults: MissionSpec = {
  version: 1,
  objective:
    "Find English-speaking cooking educators teaching repeatable skills, not restaurant reviewers.",
  platform: "instagram",
  minFollowers: 10000,
  maxFollowers: 500000,
  language: "English",
  requireNoLink: true,
  freshnessHours: 72,
  postedWithinDays: 30,
  targetCount: 20,
  reviewLimit: 20,
  draftLimit: 5,
  budgetNanos: 0,
  currency: "USD",
  source: "user_import",
  query: "cooking educators",
  productConcept: "",
  autonomy: "research",
};
export const CSV_HEADER =
  "handle,sourceUrl,observedAt,followers,exactFollowers,bioLinks,allLinkFieldsChecked,language,lastPostAt,teachingTopic,contentExcerpt,contentUrl,rightsAttested,adultStatus,offers";

export function MissionControl({
  today = false,
  initialTab,
}: {
  today?: boolean;
  initialTab?: "review" | "mission" | "setup" | "usage" | "team" | "partnerships";
}) {
  const { workspace, workspaceLabel, profiles } = useWorkspace();
  const { user } = useAuth();
  const client = useQueryClient();
  const invoke = useServerFn(creatorCommand);
  const [tab, setTab] = useState<
    "review" | "mission" | "setup" | "usage" | "team" | "partnerships"
  >(initialTab ?? (today ? "review" : "mission"));
  const [busy, setBusy] = useState(false);
  const [spec, setSpec] = useState<MissionSpec>(defaults);
  const [csv, setCsv] = useState("");
  const [ai, setAi] = useState(false);
  const [daily, setDaily] = useState("0");
  const [monthly, setMonthly] = useState("0");
  const [research, setResearch] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [invite, setInvite] = useState("");
  const [invitationId, setInvitationId] = useState("");
  const [reason, setReason] = useState("");
  const [topics, setTopics] = useState("");
  const [avoidTopics, setAvoidTopics] = useState("");
  const [feedbackReason, setFeedbackReason] = useState("");
  const [exploration, setExploration] = useState<{
    workspace: string;
    title: string;
    note: string;
    matches: EvidenceMatch[];
  } | null>(null);
  const query = useQuery({
    queryKey: ["creator", user?.id, workspace],
    queryFn: async () =>
      JSON.parse(
        await invoke({ data: { command: JSON.stringify({ action: "overview", workspace }) } }),
      ) as Overview,
    refetchInterval: 10_000,
  });
  const data = query.data;
  const providerConfigs = Object.fromEntries(
    (data?.providers ?? []).map((provider) => [provider.provider, provider.configuration]),
  );
  const currentCost = projectMissionCost(spec, ai, providerConfigs);
  async function run(command: Record<string, unknown>, message = "Saved") {
    setBusy(true);
    try {
      const result = JSON.parse(
        await invoke({ data: { command: JSON.stringify({ ...command, workspace }) } }),
      ) as Record<string, unknown>;
      toast.success(message);
      await client.invalidateQueries({ queryKey: ["creator"] });
      await client.invalidateQueries({
        predicate: (query) =>
          ["leads", "lead-page", "lead-counts"].includes(String(query.queryKey[0])),
      });
      return result;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally {
      setBusy(false);
    }
  }
  const admin = data && ["owner", "admin"].includes(data.role);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {workspaceLabel} · Creator partnerships
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {today ? "Your next ten opportunities" : "Mission Control"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Find a credible fit. Inspect the evidence. Decide the next action.
        </p>
      </header>
      <nav aria-label="Creator workflow" className="flex flex-wrap gap-2">
        {(["review", "mission", "partnerships", "usage", "team", "setup"] as const).map((t) => (
          <Button key={t} variant={t === tab ? "default" : "outline"} onClick={() => setTab(t)}>
            {
              {
                review: "Review Desk",
                mission: "Find creators",
                usage: "Usage",
                team: "Team",
                setup: "Setup",
                partnerships: "Partnerships",
              }[t]
            }
          </Button>
        ))}
      </nav>
      {query.isLoading ? <p role="status">Loading workspace records…</p> : null}
      {query.error ? (
        <div role="alert" className="rounded border border-destructive p-4">
          <h2 className="font-semibold">Setup required</h2>
          <p className="mt-2 text-sm">{query.error.message}</p>
          <p className="mt-2 text-sm">
            Configure the server database connection and apply the reviewed migrations to a
            backed-up staging database first.
          </p>
          <Button className="mt-3" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {tab === "mission" && (
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold">Turn a brief into a reviewable contract</h2>
          <label className="block text-sm">
            Brief
            <textarea
              className={field + " mt-1 min-h-24"}
              value={spec.objective}
              onChange={(e) => setSpec({ ...spec, objective: e.target.value })}
            />
          </label>
          <p className="text-sm text-muted-foreground">
            The brief is your objective. The explicit fields below define the executable hard
            filters; free text does not silently alter them. Teaching fit requires observed content
            and human review.
          </p>
          <div className="rounded border p-3 text-sm">
            <p className="font-medium">Suggested fields from your brief</p>
            <p>{compileBrief(spec.objective).explanations.join(" · ")}</p>
            <Button
              className="mt-2"
              variant="outline"
              onClick={() => setSpec({ ...spec, ...compileBrief(spec.objective).suggestions })}
            >
              Apply suggestions to editable fields
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Minimum followers">
              <input
                type="number"
                className={field}
                value={spec.minFollowers}
                onChange={(e) => setSpec({ ...spec, minFollowers: Number(e.target.value) })}
              />
            </Field>
            <Field label="Maximum followers">
              <input
                type="number"
                className={field}
                value={spec.maxFollowers}
                onChange={(e) => setSpec({ ...spec, maxFollowers: Number(e.target.value) })}
              />
            </Field>
            <Field label="Observed content language">
              <input
                className={field}
                value={spec.language}
                onChange={(e) => setSpec({ ...spec, language: e.target.value })}
              />
            </Field>
            <Field label="Evidence freshness (hours)">
              <input
                type="number"
                className={field}
                value={spec.freshnessHours}
                onChange={(e) => setSpec({ ...spec, freshnessHours: Number(e.target.value) })}
              />
            </Field>
            <Field label="Post within days">
              <input
                type="number"
                className={field}
                value={spec.postedWithinDays}
                onChange={(e) => setSpec({ ...spec, postedWithinDays: Number(e.target.value) })}
              />
            </Field>
            <Field label="Maximum expense (USD)">
              <input
                type="number"
                min="0"
                step="0.01"
                className={field}
                value={spec.budgetNanos / 1e9}
                onChange={(e) =>
                  setSpec({ ...spec, budgetNanos: Math.round(Number(e.target.value) * 1e9) })
                }
              />
            </Field>
          </div>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={spec.requireNoLink}
              onChange={(e) => setSpec({ ...spec, requireNoLink: e.target.checked })}
            />
            Require recently verified absence of ALL bio links
          </label>
          <Field label="Optional product-first concept">
            <input
              className={field}
              placeholder="An unvalidated workshop or product concept"
              value={spec.productConcept}
              onChange={(e) => setSpec({ ...spec, productConcept: e.target.value })}
            />
          </Field>
          <Button
            variant="outline"
            disabled={busy || spec.productConcept.trim().length < 5}
            onClick={async () => {
              const result = await run(
                { action: "productMatches", concept: spec.productConcept },
                "Existing content matches loaded",
              );
              if (result)
                setExploration({
                  workspace,
                  title: `Existing creator evidence for: ${spec.productConcept}`,
                  note: String(result["note"]),
                  matches: result["matches"] as EvidenceMatch[],
                });
            }}
          >
            Search permitted workspace content for this product
          </Button>
          <Field label="Approved candidate source">
            <select
              className={field}
              value={spec.source}
              onChange={(e) =>
                setSpec({ ...spec, source: e.target.value as MissionSpec["source"] })
              }
            >
              <option value="user_import">CSV of actual human observations</option>
              <option value="brave">Brave URL discovery (verification still required)</option>
              <option value="modash">Modash Raw discovery and field checks</option>
            </select>
          </Field>
          {spec.source === "user_import" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Import only records you actually observed and have rights to use. Complete-link
                coverage and exact follower counts must be attested per row. Dates use UTC ISO
                format. These remain labelled human observations, not provider verification.
              </p>
              <code className="block overflow-auto rounded bg-secondary p-3 text-xs">
                {CSV_HEADER}
              </code>
              <label className="block text-sm">
                Import CSV file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className={field}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 1_000_000) toast.error("Maximum file size: 1 MB");
                      else setCsv(await f.text());
                    }
                  }}
                />
              </label>
              <Field label="CSV contents">
                <textarea
                  className={field + " min-h-28 font-mono text-xs"}
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Discovery query">
                <input
                  className={field}
                  value={spec.query}
                  onChange={(e) => setSpec({ ...spec, query: e.target.value })}
                />
              </Field>
              <p className="text-sm">
                Bounded pilot: one page, at most 20 URLs. Search snippets do not verify no-link
                status, followers, age or language. Modash requires verified account access and
                link-field coverage. Language, adult eligibility and teaching fit remain human
                checks.
              </p>
            </>
          )}
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
            Use configured DeepSeek for shortlisted product hypotheses (paid; current pricing
            required)
          </label>
          <p className="text-sm">
            Up to {spec.targetCount} candidates → strongest supported review queue → up to{" "}
            {spec.draftLimit} extractive drafts. No outreach is sent.
          </p>
          <div className="rounded border p-3 text-sm" role="status">
            <p className="font-medium">Cost before approval</p>
            <p>
              {currentCost.minimumNanos === null
                ? "Lower amount unknown"
                : `$${nanosToUsd(currentCost.minimumNanos)} documented minimum`}{" "}
              ·{" "}
              {currentCost.reservationCeilingNanos === null
                ? "Reservation ceiling unavailable until provider setup"
                : `up to $${nanosToUsd(currentCost.reservationCeilingNanos)} reservation exposure`}{" "}
              · mission hard cap ${nanosToUsd(String(spec.budgetNanos))}
            </p>
            <p className="text-xs text-muted-foreground">
              This is a planning range, not a provider invoice. The mission may stop before all
              research if its hard cap is reached.
            </p>
            {currentCost.assumptions.map((item) => (
              <p key={item} className="text-xs text-muted-foreground">
                {item}
              </p>
            ))}
          </div>
          <Button
            disabled={busy || !data}
            onClick={() =>
              void run(
                { action: "createMission", spec, csv, useAi: ai },
                "Plan saved. Review its exact contract below before approving.",
              )
            }
          >
            Prepare executable plan
          </Button>
        </section>
      )}
      {tab === "mission" &&
        data?.missions.map((m) => (
          <section key={m.id} className="rounded-lg border bg-card p-4">
            <div className="flex justify-between gap-3">
              <h3 className="font-medium">{m.spec.objective}</h3>
              <span className="text-xs">{m.state}</span>
            </div>
            <p className="mt-2 text-sm">
              {m.spec.minFollowers.toLocaleString()}–{m.spec.maxFollowers.toLocaleString()}{" "}
              followers · {m.spec.language} ·{" "}
              {m.spec.requireNoLink ? "strict no-link" : "link permitted"} · max $
              {(m.spec.budgetNanos / 1e9).toFixed(2)} · {m.checkpoint} processed
            </p>
            {m.state === "planned" &&
              (() => {
                const estimate = projectMissionCost(m.spec, m.use_ai, providerConfigs);
                return (
                  <p className="mt-2 text-sm">
                    Current setup:{" "}
                    {estimate.minimumNanos === null
                      ? "documented minimum unknown"
                      : `$${nanosToUsd(estimate.minimumNanos)} minimum`}{" "}
                    ·{" "}
                    {estimate.reservationCeilingNanos === null
                      ? "reservation ceiling unknown"
                      : `$${nanosToUsd(estimate.reservationCeilingNanos)} full-plan ceiling`}
                    . Hard mission cap: ${nanosToUsd(String(m.spec.budgetNanos))}.
                  </p>
                );
              })()}
            <details className="my-3">
              <summary className="cursor-pointer text-sm">Inspect exact contract</summary>
              <pre className="overflow-auto p-3 text-xs">{JSON.stringify(m.spec, null, 2)}</pre>
            </details>
            {m.problem && <p className="my-2 text-sm text-amber-700">{m.problem}</p>}
            <div className="flex gap-2">
              {m.state === "planned" && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      { action: "approveMission", id: m.id, hash: m.plan_hash },
                      "Approved bounded research. Worker will process it.",
                    )
                  }
                >
                  Approve this plan and budget
                </Button>
              )}
              {["queued", "running"].includes(m.state) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run({ action: "missionState", id: m.id, state: "paused" })}
                >
                  Pause
                </Button>
              )}
              {m.state === "paused" && (
                <Button
                  disabled={busy}
                  onClick={() => void run({ action: "missionState", id: m.id, state: "queued" })}
                >
                  Resume approved plan
                </Button>
              )}
              {!["completed", "cancelled"].includes(m.state) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run({ action: "missionState", id: m.id, state: "cancelled" })}
                >
                  Cancel
                </Button>
              )}
            </div>
          </section>
        ))}
      {tab === "review" && (
        <>
          <section className="space-y-2 rounded border p-4" aria-label="Next actions">
            <h2 className="font-semibold">Next actions</h2>
            <p className="text-xs text-muted-foreground">
              Workspace-scoped, owner-aware items. Contacted leads use the CRM's two-day follow-up
              rule; check the actual conversation before acting.
            </p>
            {data?.replies.length ? (
              <a className="block text-sm underline" href="/inbox">
                {data.replies.length} unread replies in your mailbox
              </a>
            ) : null}
            {data?.followups.map((lead) => (
              <a key={lead.id} className="block text-sm underline" href="/follow-ups">
                @{lead.username} · contacted more than two days ago
              </a>
            ))}
            {data?.approvedDrafts.map((draft) => (
              <p key={draft.id} className="text-sm">
                @{draft.username} · approved draft awaiting manual action; inspect current evidence
                before contact
              </p>
            ))}
            {!data?.replies.length && !data?.followups.length && !data?.approvedDrafts.length && (
              <p className="text-sm">
                No replies, older contacts or approved drafts need your attention in this workspace.
              </p>
            )}
          </section>
          <Field label="Why this creator fits or misses the partnership (required for example feedback)">
            <input
              className={field}
              value={feedbackReason}
              onChange={(e) => setFeedbackReason(e.target.value)}
            />
          </Field>
          {!data?.drafts.length && (
            <section className="rounded-lg border p-8">
              <h2 className="text-lg font-semibold">No reviewable drafts yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Import actual observations or configure discovery. Unresolved hard filters stay out
                of the qualified queue.
              </p>
              <Button className="mt-4" onClick={() => setTab("mission")}>
                Prepare a mission
              </Button>
            </section>
          )}
          {data?.drafts.map((d) => {
            const current = qualify(d.spec, d.observation);
            return (
              <article key={d.id} className="space-y-4 rounded-lg border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">@{d.username}</h2>
                    <p className="text-xs text-muted-foreground">
                      Preference matches: {d.preference_matches} · {d.observation.method} · observed{" "}
                      {new Date(d.observation.observedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="rounded bg-secondary px-2 py-1 text-xs">
                    {current.status} · {d.state}
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    <p>
                      {d.observation.followers?.toLocaleString() ?? "Unknown"} followers ·{" "}
                      {d.observation.bioLinks}
                    </p>
                    <a
                      className="underline"
                      href={d.observation.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Inspect profile source
                    </a>
                    <blockquote className="border-l-2 pl-3">
                      {d.observation.contentExcerpt}
                    </blockquote>
                    {d.observation.contentUrl && (
                      <a
                        className="block underline"
                        href={d.observation.contentUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Supporting content
                      </a>
                    )}
                    <p>Observed offers: {d.observation.offers}</p>
                    {current.reasons.map((r) => (
                      <p key={r} className="text-amber-700">
                        {r}
                      </p>
                    ))}
                  </div>
                  <div className="text-sm">
                    <h3 className="font-semibold">Product opportunity · hypothesis</h3>
                    {Object.entries(d.opportunity).map(([k, v]) => (
                      <p key={k} className="mt-2">
                        <span className="font-medium">{k}: </span>
                        {Array.isArray(v) ? v.join("; ") : String(v)}
                      </p>
                    ))}
                  </div>
                </div>
                <DraftEditor
                  body={d.body}
                  observation={d.observation}
                  busy={busy}
                  onSave={(body) =>
                    run(
                      { action: "editDraft", id: d.id, body },
                      "Draft saved; approval reset for current evidence",
                    )
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || current.status !== "passed" || d.state !== "review"}
                    onClick={() => void run({ action: "review", id: d.id, decision: "approve" })}
                  >
                    Approve current draft
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !feedbackReason.trim()}
                    onClick={async () => {
                      const r = await run({
                        action: "feedback",
                        leadId: d.lead_id,
                        decision: "strong_fit",
                        reason: feedbackReason,
                      });
                      if (r?.["proposedTopic"]) {
                        setTopics(String(r["proposedTopic"]));
                        setReason("Strong-fit example @" + d.username);
                      }
                    }}
                  >
                    Strong fit: propose preference
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !feedbackReason.trim()}
                    onClick={async () => {
                      const r = await run({
                        action: "feedback",
                        leadId: d.lead_id,
                        decision: "not_fit",
                        reason: feedbackReason,
                      });
                      if (r?.["proposedTopic"]) {
                        setAvoidTopics(String(r["proposedTopic"]));
                        setReason("Poor-fit example @" + d.username);
                      }
                    }}
                  >
                    Poor fit: propose avoidance
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      const result = await run(
                        { action: "similarCreators", leadId: d.lead_id },
                        "Similar observed creators loaded",
                      );
                      if (result)
                        setExploration({
                          workspace,
                          title: `More like @${d.username}`,
                          note: String(result["note"]),
                          matches: result["matches"] as EvidenceMatch[],
                        });
                    }}
                  >
                    Find more like this
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      d.state !== "approved" ||
                      current.status !== "passed" ||
                      !checkDraft(d.body, d.observation)
                    }
                    onClick={async () => {
                      const result = await run(
                        { action: "prepareManualOutreach", id: d.id },
                        "Current evidence and team contact checks passed",
                      );
                      if (!result) return;
                      try {
                        await navigator.clipboard.writeText(String(result["body"]));
                        toast.success("Approved draft copied; no send recorded");
                      } catch {
                        toast.error("Clipboard permission unavailable");
                      }
                    }}
                  >
                    Copy approved draft
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run({ action: "review", id: d.id, decision: "reject" })}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || d.state !== "approved"}
                    onClick={() =>
                      void run(
                        { action: "review", id: d.id, decision: "record_manual" },
                        "Your manually completed contact was recorded",
                      )
                    }
                  >
                    I sent this manually
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run({
                        action: "suppress",
                        handle: d.username,
                        reason: "Operator requested do not contact",
                      })
                    }
                  >
                    Do not contact
                  </Button>
                </div>
              </article>
            );
          })}
          {data?.replies.length ? (
            <a className="block rounded border p-4 text-sm underline" href="/inbox">
              {data.replies.length} recent unread replies need attention → Open Inbox
            </a>
          ) : null}
          <h2 className="text-lg font-semibold">Recent observations and unresolved facts</h2>
          {data?.evidence.map((e) => (
            <div key={e.id} className="rounded border p-3 text-sm">
              <strong>@{e.username}</strong> · {e.qualification} · {e.observation.method}
              <p>
                {e.reasons.join("; ") ||
                  "All explicit field checks passed; human fit review still required."}
              </p>
              <EvidenceReview
                observation={e.observation}
                busy={busy}
                onSave={(observation) =>
                  run({
                    action: "recheck",
                    leadId: e.lead_id,
                    missionId: e.mission_id,
                    observation,
                  })
                }
              />
            </div>
          ))}
          <section className="space-y-3 rounded border p-4">
            <h2 className="font-semibold">Record your preferences</h2>
            <p className="text-sm text-muted-foreground">
              Preferred topics add one priority point; avoided topics subtract one. Feedback only
              proposes a change until you save a new version. This does not predict replies or
              change hard filters.
            </p>
            <Field label="Preferred teaching topics (comma-separated)">
              <input className={field} value={topics} onChange={(e) => setTopics(e.target.value)} />
            </Field>
            <Field label="Avoided teaching topics (comma-separated)">
              <input
                className={field}
                value={avoidTopics}
                onChange={(e) => setAvoidTopics(e.target.value)}
              />
            </Field>
            <Field label="Why these examples fit">
              <input className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button
              disabled={busy || !reason.trim()}
              onClick={() =>
                void run({
                  action: "preferences",
                  topics: topics
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                  avoidTopics: avoidTopics
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                  reason,
                })
              }
            >
              Save preference version
            </Button>
            {data?.preferences.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Prefer: {p.preferences.topics.join(", ") || "none"}; avoid:{" "}
                  {p.preferences.avoidTopics?.join(", ") || "none"} · {p.reason}
                </span>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: "preferences",
                      topics: p.preferences.topics,
                      avoidTopics: p.preferences.avoidTopics ?? [],
                      reason: "Restored version " + p.id,
                    })
                  }
                >
                  Restore as new version
                </Button>
              </div>
            ))}
          </section>
        </>
      )}
      {tab === "partnerships" && data && (
        <PartnershipOperations data={data} run={run} busy={busy} admin={Boolean(admin)} />
      )}
      {tab === "usage" && data && (
        <UsageLedger
          groups={data.usage}
          attempts={data.attempts}
          names={Object.fromEntries(
            profiles.map((profile) => [profile.id, profile.display_name ?? profile.id]),
          )}
          admin={Boolean(admin)}
          busy={busy}
          run={run}
        />
      )}
      {tab === "setup" && (
        <section className="space-y-5 rounded border p-5">
          <h2 className="text-lg font-semibold">Source and spend setup</h2>
          {data?.founders.map((f) => (
            <p key={f.email} className="text-sm">
              {f.email}: {f.verified ? "verified" : "pending verification / provisioning"} ·{" "}
              {f.member ? f.role : "membership pending"} ·{" "}
              {f.developer ? "subscription-exempt developer" : "entitlement pending"}
            </p>
          ))}
          <p className="text-sm">
            Workspace role: {data?.role ?? "unavailable"}. Only admins can configure providers and
            budgets. Live outreach, billing checkout, scheduled scouts and proposal publishing are
            not enabled.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Daily external spend ceiling (USD)">
              <input
                className={field}
                type="number"
                min="0"
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
              />
            </Field>
            <Field label="Monthly external spend ceiling (USD)">
              <input
                className={field}
                type="number"
                min="0"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs">
            Current limits: daily ${Number(data?.limits[0]?.daily_nanos ?? 0) / 1e9}, monthly $
            {Number(data?.limits[0]?.monthly_nanos ?? 0) / 1e9}. Research{" "}
            {data?.limits[0]?.research_enabled ? "enabled" : "paused"}.
          </p>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={research}
              onChange={(e) => setResearch(e.target.checked)}
            />
            Enable approved research (separate mission approval still required)
          </label>
          <Button
            disabled={busy || !admin}
            onClick={() =>
              void run({
                action: "limits",
                daily: Math.round(Number(daily) * 1e9),
                monthly: Math.round(Number(monthly) * 1e9),
                enabled: research,
              })
            }
          >
            Save limits and research switch
          </Button>
        </section>
      )}
      {tab === "setup" && (
        <ProviderSetup
          key={workspace}
          connections={(data?.providers ?? []) as never}
          admin={Boolean(admin)}
          busy={busy}
          run={run}
        />
      )}
      {tab === "setup" && <LocalHermes />}
      {tab === "team" && <TeamManagement />}
      {tab === "team" && (
        <section className="space-y-4 rounded border p-5">
          <h2 className="text-lg font-semibold">Invite explicitly</h2>
          <p className="text-sm">
            Joining {workspaceLabel} never shares a teammate's personal leads. Invitations expire
            after seven days and require the exact verified email. The token is shown once for you
            to share; no email is sent here.
          </p>
          <Field label="Verified invitee email">
            <input
              type="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Role">
            <select
              className={field}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Button
            disabled={busy || !admin}
            onClick={async () => {
              setBusy(true);
              try {
                const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
                  n.toString(16).padStart(2, "0"),
                ).join("");
                const id = await rpc<string>("create_workspace_invitation", {
                  w: workspace,
                  em: email,
                  r: inviteRole,
                  h: await invitationHash(token),
                });
                setInvite(token);
                setInvitationId(id);
                toast.success("Invitation created; share token privately");
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Create invitation
          </Button>
          {invitationId && <p className="break-all text-sm">Invitation ID: {invitationId}</p>}
          <Field label="Invitation token to share or accept">
            <input className={field} value={invite} onChange={(e) => setInvite(e.target.value)} />
          </Field>
          <Button
            variant="outline"
            disabled={busy || !invite}
            onClick={async () => {
              try {
                await rpc("accept_workspace_invitation", { h: await invitationHash(invite) });
                setInvite("");
                await client.invalidateQueries({ queryKey: ["workspaces"] });
                toast.success("Workspace invitation accepted");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Accept invitation for my verified email
          </Button>
          <Button
            variant="outline"
            disabled={!invitationId || !admin}
            onClick={async () => {
              try {
                await rpc("revoke_workspace_invitation", { i: invitationId });
                setInvite("");
                toast.success("Invitation revoked");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Revoke created invitation
          </Button>
          <h3 className="font-medium">Visible teammates</h3>
          {profiles.map((p) => (
            <p key={p.id} className="text-sm">
              {p.display_name}
            </p>
          ))}
        </section>
      )}
      {exploration?.workspace === workspace && (tab === "mission" || tab === "review") && (
        <section
          className="space-y-3 rounded border p-4"
          aria-label="Evidence-based creator exploration"
        >
          <h2 className="font-semibold">{exploration.title}</h2>
          <p className="text-xs text-muted-foreground">{exploration.note}</p>
          {!exploration.matches.length && (
            <p className="text-sm">
              No matching permitted observations in this workspace. This is not a provider search.
            </p>
          )}
          {exploration.matches.map((match) => (
            <article key={match.id} className="rounded border p-3 text-sm">
              <strong>@{match.username}</strong> · {match.qualification} · observed{" "}
              {new Date(match.observation.observedAt).toLocaleString()}
              <p>
                {match.observation.teachingTopic ?? "Teaching topic unresolved"} ·{" "}
                {match.observation.followers?.toLocaleString() ?? "followers unknown"} followers ·
                bio links {match.observation.bioLinks}
              </p>
              {match.reasons.map((reason) => (
                <p key={reason} className="text-xs">
                  {reason}
                </p>
              ))}
              <a
                className="underline"
                target="_blank"
                rel="noreferrer"
                href={match.observation.contentUrl ?? match.observation.sourceUrl}
              >
                Inspect supporting content
              </a>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}
