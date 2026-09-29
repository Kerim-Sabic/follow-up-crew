import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { nanosToUsd, usdToNanos } from "@/lib/money";

export type UsageGroup = {
  actor: string;
  provider: string;
  currency: string;
  attempts: number;
  settled_nanos: string;
  pending_nanos: string;
  reconciled_nanos: string;
};
export type UsageAttempt = {
  id: string;
  actor: string;
  provider: string;
  task: string;
  status: string;
  billing_basis: string;
  reserved_nanos: string;
  settled_nanos: string | null;
  reconciled_nanos: string | null;
  created_at: string;
};
export function UsageLedger({
  groups,
  attempts,
  names,
  admin,
  busy,
  run,
}: {
  groups: UsageGroup[];
  attempts: UsageAttempt[];
  names: Record<string, string>;
  admin: boolean;
  busy: boolean;
  run: (
    command: Record<string, unknown>,
    message?: string,
  ) => Promise<Record<string, unknown> | null>;
}) {
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const total = (field: "settled_nanos" | "pending_nanos" | "reconciled_nanos") =>
    nanosToUsd(groups.reduce((n, group) => n + BigInt(group[field]), 0n).toString());
  return (
    <section className="space-y-4 rounded border p-5">
      <h2 className="text-lg font-semibold">Workspace provider usage · USD</h2>
      <p className="text-sm text-muted-foreground">
        Tariff and token prices are estimates. Unknown outcomes keep their full reservation. Only a
        recorded invoice amount is reconciled.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Member</th>
              <th>Provider</th>
              <th>Attempts</th>
              <th>Priced estimate</th>
              <th>Unresolved ceiling</th>
              <th>Invoice recorded</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((row) => (
              <tr key={row.actor + row.provider} className="border-t">
                <td className="py-3">{names[row.actor] ?? row.actor}</td>
                <td>{row.provider}</td>
                <td>{row.attempts}</td>
                <td>${nanosToUsd(row.settled_nanos)}</td>
                <td>${nanosToUsd(row.pending_nanos)}</td>
                <td>${nanosToUsd(row.reconciled_nanos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-medium">
        Company total: ${total("settled_nanos")} estimated · ${total("pending_nanos")} unresolved ·
        ${total("reconciled_nanos")} invoice recorded
      </p>
      {admin && (
        <>
          <h3 className="font-semibold">Recent attempts</h3>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {attempts.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded border p-2 text-xs"
              >
                <span className="flex-1">
                  {item.provider} · {item.task} · {names[item.actor] ?? item.actor} ·{" "}
                  {item.billing_basis} · reserved ${nanosToUsd(item.reserved_nanos)}
                  {item.settled_nanos ? ` · estimate $${nanosToUsd(item.settled_nanos)}` : ""}
                  {item.reconciled_nanos ? ` · invoice $${nanosToUsd(item.reconciled_nanos)}` : ""}
                </span>
                {!item.reconciled_nanos && (
                  <Button variant="outline" size="sm" onClick={() => setSelected(item.id)}>
                    Record invoice
                  </Button>
                )}
              </div>
            ))}
          </div>
          {selected && (
            <div className="space-y-3 rounded border p-3">
              <p className="text-sm">
                Reconcile one attempt from an actual provider invoice. This record is permanent and
                can exceed the original ceiling.
              </p>
              <label className="block text-sm">
                Actual invoiced USD
                <input
                  className="mt-1 w-full rounded border p-2"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label className="block text-sm">
                Invoice or statement reference
                <input
                  className="mt-1 w-full rounded border p-2"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </label>
              <Button
                disabled={busy || reference.trim().length < 5}
                onClick={async () => {
                  try {
                    const actualNanos = Number(usdToNanos(amount));
                    const result = await run(
                      {
                        action: "reconcileUsage",
                        attemptId: selected,
                        actualNanos,
                        invoiceReference: reference.trim(),
                      },
                      "Invoice amount recorded",
                    );
                    if (result) {
                      setSelected("");
                      setAmount("");
                      setReference("");
                    }
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                Record reconciled amount
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
