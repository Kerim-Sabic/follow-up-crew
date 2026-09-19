import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/google-mail/return")({
  head: () => ({
    meta: [
      { title: "Connecting mailbox — Outreach CRM" },
      { name: "description", content: "Finishing the Gmail connection for your Outreach CRM mailbox." },
      { property: "og:title", content: "Connecting mailbox — Outreach CRM" },
      { property: "og:description", content: "Finishing the Gmail connection for your Outreach CRM mailbox." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OAuthReturn,
});

function OAuthReturn() {
  const [message, setMessage] = useState("Finishing connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: "google_mail", code: code ?? null },
        window.location.origin,
      );
      window.close();
    };
    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "The connection was not completed.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      setMessage("The connection finished without a code.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    notify("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <main className="grid min-h-screen place-items-center p-6 text-sm text-muted-foreground">
      <p>{message}</p>
    </main>
  );
}
