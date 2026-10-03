import type { QueryClient } from "@tanstack/react-query";

/** Keep cached CRM/mailbox data tied to the current authenticated identity. */
export function createSessionHandler<T extends { user: { id: string } }>(
  queryClient: QueryClient,
  apply: (session: T | null) => void,
) {
  let identity: string | null | undefined;
  let revision = 0;
  let disposed = false;

  function update(session: T | null) {
    if (disposed) return;
    const nextIdentity = session?.user.id ?? null;
    if (identity !== nextIdentity) queryClient.clear();
    identity = nextIdentity;
    apply(session);
  }

  return {
    onAuthEvent(session: T | null) {
      revision++;
      update(session);
    },
    async hydrate(initial: Promise<T | null>) {
      const initialRevision = revision;
      let session: T | null;
      try {
        session = await initial;
      } catch {
        session = null;
      }
      // A sign-out/account switch during getSession must win over its stale result.
      if (revision === initialRevision) update(session);
    },
    dispose() {
      disposed = true;
    },
  };
}
