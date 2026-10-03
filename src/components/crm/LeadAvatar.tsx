import { useEffect, useState } from "react";
import { Instagram } from "lucide-react";
import { cn } from "@/lib/utils";

export function instagramPhoto(username: string) {
  return `https://unavatar.io/instagram/${encodeURIComponent(username.replace(/^@/, ""))}?fallback=false`;
}

export function LeadAvatar({ username, size = "md" }: { username: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const handle = username.replace(/^@/, "");
  const initials = handle.slice(0, 2).toUpperCase() || "?";
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [handle]);

  return (
    <span className={cn(
      "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary font-semibold text-secondary-foreground",
      size === "sm" && "size-7 text-[10px]",
      size === "md" && "size-8 text-xs",
      size === "lg" && "size-12 text-sm",
      size === "xl" && "size-20 text-lg",
    )}>
      {failed ? initials : (
        <img
          src={instagramPhoto(handle)}
          alt={`@${handle}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
      {size !== "xl" ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border border-card bg-card text-muted-foreground">
          <Instagram className="size-2.5" />
        </span>
      ) : null}
    </span>
  );
}
