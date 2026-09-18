import { Instagram } from "lucide-react";
import { cn } from "@/lib/utils";

export function LeadAvatar({ username, size = "md" }: { username: string; size?: "sm" | "md" | "lg" }) {
  const initials = username.replace(/^@/, "").slice(0, 2).toUpperCase() || "?";
  return (
    <span className={cn(
      "relative inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-semibold text-secondary-foreground",
      size === "sm" && "size-7 text-[10px]",
      size === "md" && "size-8 text-xs",
      size === "lg" && "size-12 text-sm",
    )}>
      {initials}
      <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border border-card bg-card text-muted-foreground">
        <Instagram className="size-2.5" />
      </span>
    </span>
  );
}