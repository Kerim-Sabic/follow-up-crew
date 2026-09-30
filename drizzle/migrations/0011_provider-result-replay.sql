-- A billed response and its reusable normalized result commit together. A pending
-- attempt without a result is ambiguous and must never trigger a second paid call.
CREATE TABLE private.provider_results (
 attempt_id uuid PRIMARY KEY REFERENCES public.usage_attempts(id),
 workspace uuid NOT NULL REFERENCES public.workspaces(id),
 result jsonb NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.provider_results FROM PUBLIC,anon,authenticated;
CREATE TRIGGER provider_result_immutable BEFORE UPDATE OR DELETE ON private.provider_results
 FOR EACH ROW EXECUTE FUNCTION private.immutable_ledger();
