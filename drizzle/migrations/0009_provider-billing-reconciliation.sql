ALTER TABLE public.usage_attempts ADD COLUMN billing_basis text NOT NULL DEFAULT 'unresolved'
 CHECK(billing_basis IN ('unresolved','provider_usage_priced','tariff_estimate','invoice_reconciled'));
CREATE TABLE public.provider_reconciliations (
 attempt_id uuid PRIMARY KEY REFERENCES public.usage_attempts(id),
 workspace uuid NOT NULL REFERENCES public.workspaces(id),
 amount_nanos bigint NOT NULL CHECK(amount_nanos>=0),
 invoice_reference text NOT NULL CHECK(length(invoice_reference) BETWEEN 5 AND 200),
 recorded_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_reconciliations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.provider_reconciliations TO authenticated;
CREATE POLICY reconciliation_scope ON public.provider_reconciliations FOR SELECT TO authenticated USING(private.member_role(workspace) IS NOT NULL);
CREATE TRIGGER reconciliation_immutable BEFORE UPDATE OR DELETE ON public.provider_reconciliations FOR EACH ROW EXECUTE FUNCTION private.immutable_ledger();

-- Reconciliation is an append-only invoice event. It supersedes estimates for new budget decisions.
CREATE OR REPLACE FUNCTION private.reserve_attempt(w uuid,m uuid,k text,p text,t text,amount bigint,model text,rate text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lim public.spend_limits; mission public.missions; attempt public.usage_attempts;
 tz text; enabled boolean; day_start timestamptz; month_start timestamptz; day_used bigint; month_used bigint; run_used bigint;
BEGIN
 SELECT timezone,research_enabled INTO tz,enabled FROM public.workspaces WHERE id=w FOR UPDATE;
 IF NOT private.can_write(w) OR NOT coalesce(enabled,false) THEN RAISE EXCEPTION 'Research disabled or membership revoked'; END IF;
 SELECT * INTO attempt FROM public.usage_attempts WHERE workspace=w AND idempotency_key=k;
 IF attempt.id IS NOT NULL THEN RAISE EXCEPTION 'Attempt already reserved; reconcile, do not repeat provider call'; END IF;
 SELECT * INTO mission FROM public.missions WHERE workspace=w AND id=m;
 IF mission.id IS NULL OR mission.actor<>auth.uid() OR mission.state NOT IN ('queued','running') OR mission.approved_until<=now()
 OR mission.approved_until IS NULL OR amount<=0 OR mission.approval_hash IS DISTINCT FROM mission.plan_hash
 THEN RAISE EXCEPTION 'Mission approval invalid'; END IF;
 SELECT * INTO lim FROM public.spend_limits WHERE workspace=w;
 IF lim.workspace IS NULL THEN RAISE EXCEPTION 'Configure daily and monthly budgets'; END IF;
 day_start:=date_trunc('day',now() AT TIME ZONE tz) AT TIME ZONE tz;
 month_start:=date_trunc('month',now() AT TIME ZONE tz) AT TIME ZONE tz;
 -- Unknown older calls continue to consume the new window. Invoice events replace estimates.
 SELECT coalesce(sum(coalesce(r.amount_nanos,a.settled_nanos,a.reserved_nanos)) FILTER(WHERE a.created_at>=day_start OR a.status='pending'),0),
 coalesce(sum(coalesce(r.amount_nanos,a.settled_nanos,a.reserved_nanos)) FILTER(WHERE a.created_at>=month_start OR a.status='pending'),0),
 coalesce(sum(coalesce(r.amount_nanos,a.settled_nanos,a.reserved_nanos)) FILTER(WHERE a.mission_id=m),0)
 INTO day_used,month_used,run_used FROM public.usage_attempts a
 LEFT JOIN public.provider_reconciliations r ON r.attempt_id=a.id WHERE a.workspace=w;
 IF day_used+amount>lim.daily_nanos OR month_used+amount>lim.monthly_nanos OR run_used+amount>(mission.spec->>'budgetNanos')::bigint
 THEN RAISE EXCEPTION 'Budget exhausted'; END IF;
 INSERT INTO public.usage_attempts(workspace,actor,mission_id,provider,task,idempotency_key,currency,reserved_nanos,requested_model,pricing_version)
 VALUES(w,auth.uid(),m,p,t,k,'USD',amount,model,rate) RETURNING id INTO attempt.id;
 RETURN attempt.id;
END $$;
