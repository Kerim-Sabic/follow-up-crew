import { createFileRoute } from "@tanstack/react-router";
import { HermesPage } from "@/components/crm/HermesPage";

export const Route = createFileRoute("/_authenticated/hermes")({
  head: () => ({ meta: [
    { title: "Hermes AI — Outreach CRM" },
    { name: "description", content: "Connect your local Hermes model to expand and improve your lead lists." },
    { property: "og:title", content: "Hermes AI — Outreach CRM" },
    { property: "og:description", content: "Connect your local Hermes model to expand and improve your lead lists." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: HermesPage,
});
