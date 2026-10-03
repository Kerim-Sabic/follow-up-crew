CREATE TABLE public.missions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace uuid NOT NULL REFERENCES public.workspaces(id),
 actor uuid NOT NULL REFERENCES auth.users(id), spec jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 state text NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','queued','running','paused','cancelled','blocked_by_provider','blocked_by_budget','failed','completed')),
 approval_hash text, approved_at timestamptz, approved_until timestamptz,
 checkpoint integer NOT NULL DEFAULT 0, lease_until timestamptz, lease_token uuid, problem text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace,id)
);
CREATE INDEX missions_queue ON public.missions(state,lease_until,created_at);
CREATE TABLE public.creator_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace uuid NOT NULL, lead_id uuid NOT NULL,
 mission_id uuid NOT NULL, observation jsonb NOT NULL, provenance text NOT NULL,
 observed_at timestamptz NOT NULL, retrieved_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1, qualification text NOT NULL CHECK(qualification IN ('passed','failed','unresolved')),
 reasons jsonb NOT NULL, UNIQUE(workspace,id), UNIQUE(mission_id,lead_id,version),
 FOREIGN KEY(workspace,lead_id) REFERENCES public.leads(workspace_id,id),
 FOREIGN KEY(workspace,mission_id) REFERENCES public.missions(workspace,id)
);
CREATE INDEX evidence_queue ON public.creator_evidence(workspace,mission_id,qualification,lead_id);
CREATE TABLE public.partnership_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace uuid NOT NULL, lead_id uuid NOT NULL, evidence_id uuid NOT NULL,
 opportunity jsonb NOT NULL, body text NOT NULL, claims jsonb NOT NULL,
 state text NOT NULL DEFAULT 'review' CHECK(state IN ('review','approved','invalidated','rejected','manually_recorded')),
 approval_hash text, approved_by uuid, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(evidence_id), FOREIGN KEY(workspace,evidence_id) REFERENCES public.creator_evidence(workspace,id),
 FOREIGN KEY(workspace,lead_id) REFERENCES public.leads(workspace_id,id)
);
CREATE TABLE public.lead_suppressions (
 workspace uuid NOT NULL REFERENCES public.workspaces(id), handle text NOT NULL,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace,handle)
);
CREATE TABLE public.preference_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace uuid NOT NULL REFERENCES public.workspaces(id),
 actor uuid NOT NULL, preferences jsonb NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.spend_limits (
 workspace uuid PRIMARY KEY REFERENCES public.workspaces(id), currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 daily_nanos bigint NOT NULL CHECK(daily_nanos>=0), monthly_nanos bigint NOT NULL CHECK(monthly_nanos>=0)
);
CREATE TABLE public.usage_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace uuid NOT NULL, actor uuid NOT NULL,
 mission_id uuid NOT NULL, provider text NOT NULL, task text NOT NULL, idempotency_key text NOT NULL,
 currency text NOT NULL CHECK(currency='USD'), reserved_nanos bigint NOT NULL CHECK(reserved_nanos>0),
 settled_nanos bigint CHECK(settled_nanos>=0), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','settled')),
 usage jsonb, pricing_version text, requested_model text, resolved_model text,
 created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz,
 UNIQUE(workspace,idempotency_key), FOREIGN KEY(workspace,mission_id) REFERENCES public.missions(workspace,id)
);
CREATE INDEX usage_scope_time ON public.usage_attempts(workspace,created_at);
CREATE TABLE private.provider_connections (
 workspace uuid NOT NULL REFERENCES public.workspaces(id), provider text NOT NULL CHECK(provider IN ('deepseek','brave')),
 ciphertext text NOT NULL, fingerprint text NOT NULL, models jsonb NOT NULL DEFAULT '[]',
 validated_at timestamptz, rights_confirmed boolean NOT NULL DEFAULT false,
 configuration jsonb NOT NULL DEFAULT '{}', PRIMARY KEY(workspace,provider)
);
REVOKE ALL ON private.provider_connections FROM PUBLIC,authenticated,anon;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['missions','creator_evidence','partnership_drafts','lead_suppressions','preference_versions','spend_limits','usage_attempts'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 EXECUTE format('CREATE POLICY scope_read ON public.%I FOR SELECT TO authenticated USING(private.member_role(workspace) IS NOT NULL)',t);
 END LOOP;
END $$;

-- Serialize every attempt within the workspace before inspecting ALL applicable ceilings.
-- Pending unknown outcomes always retain their complete reservation. Billing exemption is irrelevant.
CREATE FUNCTION private.reserve_attempt(w uuid,m uuid,k text,p text,t text,amount bigint,model text,rate text)
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
 OR mission.approved_until IS NULL OR amount<=0 THEN RAISE EXCEPTION 'Mission approval invalid'; END IF;
 SELECT * INTO lim FROM public.spend_limits WHERE workspace=w;
 IF lim.workspace IS NULL THEN RAISE EXCEPTION 'Configure daily and monthly budgets'; END IF;
 day_start:=date_trunc('day',now() AT TIME ZONE tz) AT TIME ZONE tz;
 month_start:=date_trunc('month',now() AT TIME ZONE tz) AT TIME ZONE tz;
 -- Pending calls from previous windows carry into the new window until settled.
 SELECT coalesce(sum(coalesce(settled_nanos,reserved_nanos)) FILTER(WHERE created_at>=day_start OR status='pending'),0),
 coalesce(sum(coalesce(settled_nanos,reserved_nanos)) FILTER(WHERE created_at>=month_start OR status='pending'),0),
 coalesce(sum(coalesce(settled_nanos,reserved_nanos)) FILTER(WHERE mission_id=m),0)
 INTO day_used,month_used,run_used FROM public.usage_attempts WHERE workspace=w;
 IF day_used+amount>lim.daily_nanos OR month_used+amount>lim.monthly_nanos OR run_used+amount>(mission.spec->>'budgetNanos')::bigint
 THEN RAISE EXCEPTION 'Budget exhausted'; END IF;
 INSERT INTO public.usage_attempts(workspace,actor,mission_id,provider,task,idempotency_key,currency,reserved_nanos,requested_model,pricing_version)
 VALUES(w,auth.uid(),m,p,t,k,'USD',amount,model,rate) RETURNING id INTO attempt.id;
 RETURN attempt.id;
END $$;
REVOKE ALL ON FUNCTION private.reserve_attempt(uuid,uuid,text,text,text,bigint,text,text) FROM PUBLIC;
-- Server / worker invokes this under authenticated role; it is never exposed as a public RPC.
GRANT EXECUTE ON FUNCTION private.reserve_attempt(uuid,uuid,text,text,text,bigint,text,text) TO authenticated;

CREATE FUNCTION public.lead_page(w uuid,q text DEFAULT '',s text DEFAULT '',o text DEFAULT '',e text DEFAULT '',after_id uuid DEFAULT NULL,page_size integer DEFAULT 100)
RETURNS SETOF public.leads LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.leads WHERE workspace_id=w AND (after_id IS NULL OR id>after_id)
 AND (q='' OR strpos(lower(username || ' ' || coalesce(full_name,'') || ' ' || coalesce(email,'')),lower(left(q,100)))>0)
 AND (s='' OR stage=s) AND (o='' OR (o='mine' AND owner_id=auth.uid()) OR (o='unassigned' AND owner_id IS NULL))
 AND (e='' OR (e='yes' AND email IS NOT NULL AND email<>'') OR (e='no' AND (email IS NULL OR email='')))
 ORDER BY id LIMIT greatest(1,least(page_size,101))
$$;
CREATE FUNCTION public.lead_counts(w uuid) RETURNS TABLE(stage text,total bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT stage,count(*) FROM public.leads WHERE workspace_id=w GROUP BY stage
$$;
REVOKE ALL ON FUNCTION public.lead_page(uuid,text,text,text,text,uuid,integer),public.lead_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_page(uuid,text,text,text,text,uuid,integer),public.lead_counts(uuid) TO authenticated;

-- Atomic assignment: no teammate can overwrite another teammate's claim via ordinary edits.
CREATE FUNCTION private.guard_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT private.legacy_open() THEN
 IF NEW.owner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace=NEW.workspace_id AND user_id=NEW.owner_id)
 THEN RAISE EXCEPTION 'Assignee is not a member'; END IF;
 IF TG_OP='UPDATE' AND OLD.owner_id IS NOT NULL AND OLD.owner_id IS DISTINCT FROM NEW.owner_id AND OLD.owner_id<>auth.uid()
 THEN RAISE EXCEPTION 'Lead already claimed; current owner must release it'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lead_assignment BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION private.guard_assignment();

CREATE FUNCTION private.evidence_changed() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public.partnership_drafts SET state='invalidated',approval_hash=NULL WHERE workspace=NEW.workspace AND lead_id=NEW.lead_id AND evidence_id<>NEW.id AND state IN ('review','approved');
 RETURN NEW;
END $$;
CREATE TRIGGER evidence_changed AFTER INSERT ON public.creator_evidence FOR EACH ROW EXECUTE FUNCTION private.evidence_changed();
