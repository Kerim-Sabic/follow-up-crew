import { useEffect, useState } from "react";
import { analyzeDraft, composeDraft, genericDraft, type Observation } from "@/lib/mission-domain";
import { Button } from "@/components/ui/button";

export function DraftEditor({
  body,
  observation,
  busy,
  onSave,
}: {
  body: string;
  observation: Observation;
  busy: boolean;
  onSave: (body: string) => Promise<unknown>;
}) {
  const [text, setText] = useState(body);
  useEffect(() => setText(body), [body]);
  const analysis = analyzeDraft(text, observation);
  const unsaved = text !== body;
  return (
    <div className="space-y-2 rounded bg-secondary/50 p-4">
      <h3 className="text-sm font-semibold">Editable approach · deterministic claim check</h3>
      <textarea
        aria-label="Edit outreach draft"
        className="min-h-28 w-full rounded border bg-card p-2 text-sm"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <p role="status" className="text-xs">
        {analysis.status}: {analysis.explanation} {unsaved ? "Changes are not saved yet." : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setText(genericDraft(observation))}>
          Use generic truthful approach
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            try {
              setText(composeDraft(observation).body);
            } catch {
              setText(genericDraft(observation));
            }
          }}
        >
          Use exact evidence excerpt
        </Button>
        <Button
          size="sm"
          disabled={busy || !unsaved || text.trim().length < 20}
          onClick={() => void onSave(text)}
        >
          Save edited draft
        </Button>
      </div>
      {analysis.status === "UNSUPPORTED" && (
        <p className="text-xs text-amber-700">
          You may save this for revision, but approval is blocked until the factual wording is
          supported.
        </p>
      )}
    </div>
  );
}
