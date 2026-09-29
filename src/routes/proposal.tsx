import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { sharedProposal } from "@/lib/creator.functions";
export const Route = createFileRoute("/proposal")({
  head: () => ({
    meta: [
      { title: "Concept for discussion" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: Proposal,
});
function Proposal() {
  const read = useServerFn(sharedProposal);
  const [result, setResult] = useState<{ title: string; content: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    const token = window.location.hash.slice(1);
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setError("A valid approved proposal link is required");
      return;
    }
    void read({ data: { token } })
      .then((r) => {
        if (mounted) setResult(r);
      })
      .catch(() => {
        if (mounted) setError("This proposal is unavailable, expired or revoked.");
      });
    return () => {
      mounted = false;
    };
  }, [read]);
  return (
    <main className="mx-auto max-w-3xl p-8">
      <p className="text-sm uppercase tracking-widest text-muted-foreground">
        Concept for discussion · not a creator endorsement
      </p>
      {error ? (
        <p className="mt-6" role="alert">
          {error}
        </p>
      ) : result ? (
        <>
          <h1 className="mt-6 text-3xl font-semibold">{result.title}</h1>
          <p className="mt-8 whitespace-pre-wrap leading-7">{result.content}</p>
        </>
      ) : (
        <p className="mt-6" role="status">
          Opening approved proposal…
        </p>
      )}
    </main>
  );
}
