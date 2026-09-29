import { useState } from "react";
import type { Observation } from "@/lib/mission-domain";
import { Button } from "@/components/ui/button";
export function EvidenceReview({
  observation,
  onSave,
  busy,
}: {
  observation: Observation;
  onSave: (o: Observation) => Promise<unknown>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(observation);
  const field = "block w-full rounded border bg-card p-2 text-sm";
  return (
    <div className="mt-3">
      <Button variant="outline" onClick={() => setOpen((v) => !v)}>
        {open ? "Close observation form" : "Resolve a missing fact / record a change"}
      </Button>
      {open && (
        <div className="mt-3 grid gap-3 rounded border p-4 sm:grid-cols-2">
          <p className="text-sm sm:col-span-2">
            Only record facts you actually checked. This creates a new human observation and
            preserves the prior source. Dates do not advance automatically. A changed observation
            invalidates dependent drafts.
          </p>
          <label>
            Observed at (UTC ISO)
            <input
              className={field}
              value={value.observedAt}
              onChange={(e) => setValue({ ...value, observedAt: e.target.value })}
            />
          </label>
          <label>
            Profile source URL
            <input
              className={field}
              value={value.sourceUrl}
              onChange={(e) => setValue({ ...value, sourceUrl: e.target.value })}
            />
          </label>
          <label>
            Observed followers
            <input
              type="number"
              className={field}
              value={value.followers ?? ""}
              onChange={(e) =>
                setValue({ ...value, followers: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
          <label>
            Link state
            <select
              className={field}
              value={value.bioLinks}
              onChange={(e) =>
                setValue({ ...value, bioLinks: e.target.value as Observation["bioLinks"] })
              }
            >
              <option>UNKNOWN</option>
              <option>PRESENT</option>
              <option>ABSENT_VERIFIED</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={value.exactFollowers}
              onChange={(e) => setValue({ ...value, exactFollowers: e.target.checked })}
            />{" "}
            Follower count is exact
          </label>
          <label>
            <input
              type="checkbox"
              checked={value.allLinkFieldsChecked}
              onChange={(e) => setValue({ ...value, allLinkFieldsChecked: e.target.checked })}
            />{" "}
            I checked all current bio-link fields
          </label>
          <label>
            Observed content language
            <input
              className={field}
              value={value.language ?? ""}
              onChange={(e) => setValue({ ...value, language: e.target.value || null })}
            />
          </label>
          <label>
            Observed post date (UTC ISO)
            <input
              className={field}
              value={value.lastPostAt ?? ""}
              onChange={(e) => setValue({ ...value, lastPostAt: e.target.value || null })}
            />
          </label>
          <label>
            Actual teaching topic
            <input
              className={field}
              value={value.teachingTopic ?? ""}
              onChange={(e) => setValue({ ...value, teachingTopic: e.target.value || null })}
            />
          </label>
          <label>
            Content source URL
            <input
              className={field}
              value={value.contentUrl ?? ""}
              onChange={(e) => setValue({ ...value, contentUrl: e.target.value || null })}
            />
          </label>
          <label className="sm:col-span-2">
            Exact content excerpt
            <textarea
              className={field}
              value={value.contentExcerpt ?? ""}
              onChange={(e) => setValue({ ...value, contentExcerpt: e.target.value || null })}
            />
          </label>
          <label>
            Adult eligibility
            <select
              className={field}
              value={value.adultStatus}
              onChange={(e) =>
                setValue({ ...value, adultStatus: e.target.value as Observation["adultStatus"] })
              }
            >
              <option value="unknown">Unresolved</option>
              <option value="adult">Verified adult</option>
              <option value="minor">Known minor — suppress outreach</option>
            </select>
          </label>
          <label>
            Observed offers
            <input
              className={field}
              value={value.offers}
              onChange={(e) => setValue({ ...value, offers: e.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={value.rightsAttested}
              onChange={(e) => setValue({ ...value, rightsAttested: e.target.checked })}
            />{" "}
            Source use and processing rights confirmed
          </label>
          <Button
            disabled={busy}
            onClick={async () => {
              const result = await onSave({ ...value, method: "human_observation" });
              if (result) setOpen(false);
            }}
          >
            Save checked observation
          </Button>
        </div>
      )}
    </div>
  );
}
