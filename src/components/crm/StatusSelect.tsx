import { STATUSES, statusMeta, type LeadStatus } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    <Select
        value={value}
        onValueChange={(next) => onChange(next as LeadStatus)}
      >
      <SelectTrigger onClick={(event) => event.stopPropagation()} className={cn("h-7 w-auto min-w-28 gap-1 rounded-full border-0 px-2.5 text-xs font-medium shadow-none [&>svg]:hidden", meta.className, className)}>
        <span className={cn("size-1.5 rounded-full", meta.dot)} />
        <SelectValue />
        <ChevronDown className="size-3 opacity-60" />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((status) => (
          <SelectItem key={status.value} value={status.value}><span className="flex items-center gap-2"><span className={cn("size-1.5 rounded-full", status.dot)} />{status.label}</span></SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
