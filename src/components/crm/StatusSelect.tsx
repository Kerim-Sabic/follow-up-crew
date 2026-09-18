import { STATUSES, statusMeta, type LeadStatus } from "@/lib/crm";
import { cn } from "@/lib/utils";

export function StatusSelect({
  value,
  onChange,
  className,
}: {
  value: LeadStatus;
  onChange: (status: LeadStatus) => void;
  className?: string;
}) {
  const meta = statusMeta(value);
  return (
    <div className={cn("relative inline-flex", className)}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as LeadStatus)}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "appearance-none rounded-full px-3 py-1 pr-7 text-[11px] font-semibold uppercase tracking-wide outline-none transition-shadow focus:ring-2 focus:ring-ring/40",
          meta.className,
        )}
      >
        {STATUSES.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] opacity-60">
        ▼
      </span>
    </div>
  );
}
