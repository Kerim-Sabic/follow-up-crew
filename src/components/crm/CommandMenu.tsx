import { useNavigate } from "@tanstack/react-router";
import { BarChart3, Inbox, Plus, Search, Settings, Users, Zap } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { StatusPill } from "./StatusPill";
import { LeadAvatar } from "./LeadAvatar";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";

export function CommandMenu() {
  const navigate = useNavigate();
  const { leads, commandOpen, setCommandOpen, setAddLeadOpen, setActiveLead } = useWorkspace();
  const run = (action: () => void) => { action(); setCommandOpen(false); };
  return <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
    <CommandInput placeholder="Search leads, pages and actions…" />
    <CommandList>
      <CommandEmpty>No lead or action found.</CommandEmpty>
      <CommandGroup heading="Actions">
        <CommandItem onSelect={() => run(() => setAddLeadOpen(true))}><Plus />Add lead<CommandShortcut>N</CommandShortcut></CommandItem>
        <CommandItem onSelect={() => run(() => navigate({ to: "/outreach" }))}><Zap />Start outreach</CommandItem>
      </CommandGroup>
      <CommandGroup heading="Navigate">
        <CommandItem onSelect={() => run(() => navigate({ to: "/leads" }))}><Users />Leads</CommandItem>
        <CommandItem onSelect={() => run(() => navigate({ to: "/replies" }))}><Inbox />Replies</CommandItem>
        <CommandItem onSelect={() => run(() => navigate({ to: "/analytics" }))}><BarChart3 />Analytics</CommandItem>
        <CommandItem onSelect={() => run(() => navigate({ to: "/settings" }))}><Settings />Settings</CommandItem>
      </CommandGroup>
      <CommandGroup heading="Leads">
        {leads.slice(0, 50).map((lead) => <CommandItem key={lead.id} value={`${lead.username} ${lead.email ?? ""}`} onSelect={() => run(() => setActiveLead(lead))}><LeadAvatar username={lead.username} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">@{lead.username.replace(/^@/, "")}</span><span className="block truncate text-xs text-muted-foreground">{lead.email ?? "No email"}</span></span><StatusPill status={lead.status} /></CommandItem>)}
      </CommandGroup>
    </CommandList>
  </CommandDialog>;
}