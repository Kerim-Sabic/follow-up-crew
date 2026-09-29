import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/bulk-export/$id")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const form = await request.formData();
        const token = form.get("token");
        if (typeof token !== "string") return new Response("Download unavailable", { status: 400 });
        try {
          const { consumeDownload, exportStream } = await import("@/server/bulk-jobs.server");
          const grant = await consumeDownload(params.id, token);
          return new Response(exportStream(grant.actor, grant.workspace, params.id), {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="workspace-leads.csv"',
              "Cache-Control": "no-store",
              "Referrer-Policy": "no-referrer",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return new Response("Download unavailable", { status: 403 });
        }
      },
    },
  },
});
