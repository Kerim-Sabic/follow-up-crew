import { AlertCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton() {
  return <div className="overflow-hidden rounded-lg border border-border bg-card">
    <div className="h-9 border-b border-border bg-secondary/60" />
    {Array.from({ length: 10 }).map((_, index) => <div key={index} className="flex h-14 items-center gap-4 border-b border-border/70 px-4 last:border-0"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-3.5 w-32" /><Skeleton className="ml-auto h-3.5 w-44" /><Skeleton className="h-6 w-24 rounded-full" /></div>)}
  </div>;
}

export function EmptyState({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground"><Inbox className="size-5" /></span><h3 className="text-sm font-semibold text-foreground">{title}</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>{action && onAction ? <Button variant="outline" size="sm" className="mt-4" onClick={onAction}>{action}</Button> : null}</div>;
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><AlertCircle className="mb-3 size-6 text-destructive" /><h3 className="text-sm font-semibold text-foreground">Couldn't load this workspace</h3><p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>{onRetry ? <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Retry</Button> : null}</div>;
}