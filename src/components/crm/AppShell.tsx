import { useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, BarChart3, Bell, ChevronLeft, CircleHelp, Columns3, Home, Inbox,
  Menu, MessageSquareText, PanelLeftClose, PanelLeftOpen, Plus,
  Search, Settings, Users, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { updateLeadStatus, type LeadStatus } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { AddLeadDialog } from "./AddLeadDialog";
import { LeadPanel } from "./LeadPanel";
import { CommandMenu } from "./CommandMenu";
import { cn } from "@/lib/utils";

const groups = [
  { label: "Workspace", items: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/leads", label: "Leads", icon: Users },
    { to: "/outreach", label: "Outreach", icon: Zap },
    { to: "/replies", label: "Replies", icon: Inbox },
    { to: "/follow-ups", label: "Follow-ups", icon: Activity },
    { to: "/pipeline", label: "Pipeline", icon: Columns3 },
  ]},
  { label: "Insights", items: [{ to: "/analytics", label: "Analytics", icon: BarChart3 }] },
  { label: "Library", items: [{ to: "/templates", label: "Templates", icon: MessageSquareText }] },
];

export function AppShell() {
  const { user } = useAuth();
  if (!user) return null;
  return <WorkspaceProvider userId={user.id}><ShellContent /></WorkspaceProvider>;
}

function ShellContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { leads, profiles, addLeadOpen, setAddLeadOpen, activeLead, setActiveLead, setCommandOpen } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const profile = profiles.find((item) => item.id === user?.id);
  const pageTitle = groups.flatMap((group) => group.items).find((item) => item.to === pathname)?.label ?? "Workspace";
  const replied = leads.filter((lead) => lead.status === "replied").length;
  const followups = leads.filter((lead) => lead.status === "contacted" && lead.last_touched_at && Date.now() - new Date(lead.last_touched_at).getTime() > 2 * 86400000).length;
  const statusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: LeadStatus }) => updateLeadStatus(ids, status, user?.id ?? ""),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return <div className="min-h-screen bg-background text-foreground">
    {mobileOpen ? <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-foreground/20 lg:hidden" onClick={() => setMobileOpen(false)} /> : null}
    <aside className={cn("fixed inset-y-0 left-0 z-40 flex border-r border-sidebar-border bg-sidebar transition-[width,transform] duration-200", collapsed ? "w-16" : "w-[232px]", mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Zap className="size-4" /></span>
          {!collapsed ? <span className="truncate text-sm font-semibold">Outreach CRM</span> : null}
          <Button variant="ghost" size="icon" className="ml-auto hidden size-8 lg:inline-flex" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group) => <div key={group.label} className="mb-5">
            {!collapsed ? <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase text-muted-foreground">{group.label}</p> : null}
            <div className="space-y-0.5">{group.items.map((item) => {
              const Icon = item.icon;
              const count = item.to === "/replies" ? replied : item.to === "/follow-ups" ? followups : 0;
              return <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)} title={collapsed ? item.label : undefined} className={cn("flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground", pathname === item.to && "bg-sidebar-accent text-sidebar-foreground", collapsed && "justify-center px-0")}>
                <Icon className="size-4 shrink-0" />{!collapsed ? <><span>{item.label}</span>{count > 0 ? <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span> : null}</> : null}
              </Link>;
            })}</div>
          </div>)}
        </nav>
        <div className="border-t border-sidebar-border p-2">
          <Link to="/settings" className={cn("flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent", collapsed && "justify-center px-0")}><Settings className="size-4" />{!collapsed ? "Settings" : null}</Link>
          <button className={cn("flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent", collapsed && "justify-center px-0")}><CircleHelp className="size-4" />{!collapsed ? "Help" : null}</button>
          <button onClick={signOut} className={cn("mt-2 flex w-full items-center gap-2.5 rounded-md border-t border-sidebar-border px-2.5 pt-3 text-left", collapsed && "justify-center px-0")}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{(profile?.display_name ?? user?.email ?? "U").slice(0, 2).toUpperCase()}</span>
            {!collapsed ? <span className="min-w-0"><span className="block truncate text-xs font-medium">{profile?.display_name ?? "Workspace member"}</span><span className="block truncate text-[11px] text-muted-foreground">{user?.email}</span></span> : null}
          </button>
        </div>
      </div>
    </aside>

    <div className={cn("min-h-screen transition-[padding] duration-200", collapsed ? "lg:pl-16" : "lg:pl-[232px]")}>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:px-6">
        <Button variant="ghost" size="icon" className="size-8 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu /></Button>
        <div className="flex items-center gap-2 text-sm"><span className="hidden text-muted-foreground sm:inline">Workspace</span><ChevronLeft className="hidden size-3 rotate-180 text-muted-foreground sm:block" /><span className="font-medium">{pageTitle}</span></div>
        <button onClick={() => setCommandOpen(true)} className="mx-auto hidden h-8 w-full max-w-md items-center gap-2 rounded-md border border-input bg-card px-2.5 text-left text-xs text-muted-foreground shadow-sm hover:bg-secondary md:flex"><Search className="size-3.5" /><span className="flex-1">Search leads or run a command</span><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px]">⌘ K</kbd></button>
        <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon" className="size-8" aria-label="Notifications"><Bell /></Button><Button size="sm" onClick={() => setAddLeadOpen(true)}><Plus /> Add lead</Button></div>
      </header>
      <main className="min-w-0"><Outlet /></main>
    </div>
    <CommandMenu />
    {addLeadOpen && user ? <AddLeadDialog userId={user.id} onClose={() => setAddLeadOpen(false)} /> : null}
    {activeLead && user ? <LeadPanel lead={activeLead} userId={user.id} ownerName={(id) => id === user.id ? "You" : profiles.find((item) => item.id === id)?.display_name ?? "Unassigned"} onClose={() => setActiveLead(null)} onStatusChange={(ids, status) => statusMutation.mutate({ ids, status })} /> : null}
  </div>;
}