import { createFileRoute } from "@tanstack/react-router";
import { MissionControl } from "@/components/crm/MissionControl";
function AnalyticsPage() {
  return <MissionControl initialTab="usage" />;
}
export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Outreach CRM" },
      { name: "description", content: "Measure outreach and pipeline performance." },
      { property: "og:title", content: "Analytics — Outreach CRM" },
      { property: "og:description", content: "Measure outreach and pipeline performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});
