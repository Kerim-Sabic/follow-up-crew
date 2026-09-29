import { useState } from "react";
import { Button } from "@/components/ui/button";
type Data = {
  evidence: { lead_id: string; username: string }[];
  proposals: { id: string; title: string; public_content: string }[];
  projects: {
    id: string;
    agreed_scope: string;
    validation_task: string;
    state: string;
    agreed_terms: string;
  }[];
};
export function PartnershipOperations({
  data,
  run,
  busy,
  admin,
}: {
  data: Data;
  run: (
    command: Record<string, unknown>,
    message?: string,
  ) => Promise<Record<string, unknown> | null>;
  busy: boolean;
  admin: boolean;
}) {
  const [lead, setLead] = useState(""),
    [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [share, setShare] = useState("");
  const [reference, setReference] = useState(""),
    [scope, setScope] = useState(""),
    [validation, setValidation] = useState(""),
    [terms, setTerms] = useState("");
  const field = "block w-full rounded border bg-card p-2 text-sm";
  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded border p-5">
        <h2 className="text-lg font-semibold">Private proposal</h2>
        <p className="text-sm">
          Write only material intended for this proposal. Sharing excludes scores, contact details,
          notes and the rest of the workspace. The concept is not a creator endorsement.
        </p>
        <label className="block text-sm">
          Creator
          <select className={field} value={lead} onChange={(e) => setLead(e.target.value)}>
            <option value="">Choose a researched creator</option>
            {[...new Map(data.evidence.map((e) => [e.lead_id, e])).values()].map((e) => (
              <option key={e.lead_id} value={e.lead_id}>
                @{e.username}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Proposal title
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block text-sm">
          Approved proposal text
          <textarea
            className={field + " min-h-32"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>
        <Button
          disabled={busy || !lead || !title || content.length < 10}
          onClick={() =>
            void run(
              { action: "saveProposal", leadId: lead, title, content },
              "Private proposal saved; no link published",
            )
          }
        >
          Save privately
        </Button>
      </section>
      {data.proposals.map((p) => (
        <section key={p.id} className="space-y-3 rounded border p-5">
          <h3 className="font-semibold">{p.title}</h3>
          <p className="whitespace-pre-wrap text-sm">{p.public_content}</p>
          <p className="text-xs text-muted-foreground">
            Anyone possessing an approved link can read this title and text for seven days. This is
            a bearer link, not authenticated access.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={busy || !admin}
              onClick={async () => {
                const result = await run(
                  { action: "shareProposal", id: p.id, days: 7 },
                  "Sharing approved for this proposal only",
                );
                if (result?.["token"])
                  setShare(`${window.location.origin}/proposal#${result["token"]}`);
              }}
            >
              Approve sharing these fields for 7 days
            </Button>
            <Button
              variant="outline"
              disabled={busy || !admin}
              onClick={async () => {
                await run({ action: "revokeProposal", id: p.id });
                setShare("");
              }}
            >
              Revoke all links
            </Button>
          </div>
        </section>
      ))}
      {share && (
        <label className="block text-sm">
          Approved share link
          <input readOnly className={field} value={share} />
        </label>
      )}
      <section className="space-y-3 rounded border p-5">
        <h2 className="text-lg font-semibold">Handoff after an actual agreement</h2>
        <p className="text-sm">
          Select the creator above. Record the agreement before opening validation work; a positive
          reply alone is not an agreement.
        </p>
        <label className="block text-sm">
          Agreement reference (document or recorded conversation)
          <input
            className={field}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Agreed scope
          <textarea className={field} value={scope} onChange={(e) => setScope(e.target.value)} />
        </label>
        <label className="block text-sm">
          First validation task
          <input
            className={field}
            value={validation}
            onChange={(e) => setValidation(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Agreed commercial terms (recorded only; no funds move)
          <textarea className={field} value={terms} onChange={(e) => setTerms(e.target.value)} />
        </label>
        <Button
          disabled={
            busy || !lead || reference.length < 5 || scope.length < 10 || validation.length < 5
          }
          onClick={() =>
            void run({
              action: "handoff",
              leadId: lead,
              scope,
              agreementReference: reference,
              validationTask: validation,
              agreedTerms: terms,
            })
          }
        >
          Record agreement and create handoff
        </Button>
      </section>
      {data.projects.map((p) => (
        <section key={p.id} className="rounded border p-4">
          <h3 className="font-semibold">{p.agreed_scope}</h3>
          <p className="my-2 text-sm">Next task: {p.validation_task}</p>
          <p className="text-sm">Agreed terms: {p.agreed_terms || "Not recorded"}</p>
          <label className="mt-3 block text-sm">
            Project state
            <select
              className={field}
              value={p.state}
              disabled={busy}
              onChange={(e) =>
                void run({ action: "projectState", id: p.id, state: e.target.value })
              }
            >
              {["validation", "production", "launched", "closed"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </section>
      ))}
    </div>
  );
}
