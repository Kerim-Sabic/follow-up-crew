import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "@/components/crm/InboxPage";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Outreach CRM" },
      { name: "description", content: "Read and answer lead replies from your own connected mailbox." },
      { property: "og:title", content: "Inbox — Outreach CRM" },
      { property: "og:description", content: "Read and answer lead replies from your own connected mailbox." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InboxPage,
});
