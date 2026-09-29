CREATE TABLE public.creator_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace uuid NOT NULL REFERENCES public.workspaces(id),
 lead_id uuid NOT NULL,actor uuid NOT NULL,decision text NOT NULL CHECK(decision IN ('strong_fit','not_fit','unsure')),
 topic text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace,lead_id) REFERENCES public.leads(workspace,id)
);
CREATE TABLE public.partnership_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace uuid NOT NULL REFERENCES public.workspaces(id),lead_id uuid NOT NULL,
 actor uuid NOT NULL,agreed_scope text NOT NULL,agreement_reference text NOT NULL,validation_task text NOT NULL,
 state text NOT NULL DEFAULT 'validation' CHECK(state IN ('validation','production','launched','closed')),
 proposed_terms text NOT NULL DEFAULT 'Not specified',agreed_terms text NOT NULL DEFAULT 'Not recorded',
 launch_url text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace,lead_id),
 FOREIGN KEY(workspace,lead_id) REFERENCES public.leads(workspace,id)
);
CREATE TABLE public.proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace uuid NOT NULL REFERENCES public.workspaces(id),lead_id uuid NOT NULL,
 title text NOT NULL,public_content text NOT NULL,version integer NOT NULL DEFAULT 1,created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace,lead_id) REFERENCES public.leads(workspace,id)
);
CREATE TABLE private.proposal_shares (
 token_hash text PRIMARY KEY,proposal_id uuid NOT NULL REFERENCES public.proposals(id),version integer NOT NULL,
 approved_by uuid NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['creator_feedback','partnership_projects','proposals'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY scope_read ON public.%I FOR SELECT TO authenticated USING(private.member_role(workspace) IS NOT NULL)',t);
 END LOOP;
END $$;
CREATE INDEX leads_normalized_identity ON public.leads(workspace,lower(regexp_replace(username,'^@','')));
CREATE FUNCTION private.guard_lead_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT private.can_write(NEW.workspace) THEN RAISE EXCEPTION 'Workspace permission denied'; END IF;
 IF TG_OP='INSERT' OR lower(regexp_replace(NEW.username,'^@',''))<>lower(regexp_replace(OLD.username,'^@','')) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace::text||':'||lower(regexp_replace(NEW.username,'^@','')),0));
  IF EXISTS(SELECT 1 FROM public.leads WHERE workspace=NEW.workspace AND lower(regexp_replace(username,'^@',''))=lower(regexp_replace(NEW.username,'^@','')) AND id<>NEW.id)
  THEN RAISE EXCEPTION 'Creator already exists in this workspace'; END IF;
 END IF;
 IF auth.uid() IS NOT NULL AND TG_OP='UPDATE' THEN NEW.last_touched_by:=auth.uid(); NEW.last_touched_at:=now(); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lead_identity BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION private.guard_lead_identity();
REVOKE ALL ON private.proposal_shares FROM PUBLIC,anon,authenticated;

-- Bind each paid approval to the encrypted connection identity and reviewed configuration.
ALTER TABLE public.missions ADD COLUMN provider_bindings jsonb NOT NULL DEFAULT '{}';
CREATE FUNCTION private.check_funding_binding() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE binding jsonb; current_binding jsonb;
BEGIN
 SELECT provider_bindings->NEW.provider INTO binding FROM public.missions WHERE workspace=NEW.workspace AND id=NEW.mission_id;
 SELECT jsonb_build_object('fingerprint',fingerprint,'configuration',configuration,'rights',rights_confirmed)
 INTO current_binding FROM private.provider_connections WHERE workspace=NEW.workspace AND provider=NEW.provider;
 IF binding IS NULL OR current_binding IS NULL OR binding<>current_binding THEN RAISE EXCEPTION 'Funding configuration changed; new plan approval required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER usage_funding_binding BEFORE INSERT ON public.usage_attempts FOR EACH ROW EXECUTE FUNCTION private.check_funding_binding();
CREATE FUNCTION private.create_team(n text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL) OR length(trim(n)) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Verified account and workspace name required'; END IF;
 IF (SELECT count(*) FROM public.workspace_members WHERE user_id=auth.uid() AND role='owner')>=10 THEN RAISE EXCEPTION 'Workspace creation limit reached'; END IF;
 INSERT INTO public.workspaces(name,kind) VALUES(trim(n),'team') RETURNING id INTO w;
 INSERT INTO public.workspace_members VALUES(w,auth.uid(),'owner',false);
 INSERT INTO public.audit_events(workspace,actor,action,resource_id) VALUES(w,auth.uid(),'workspace.created',w::text);
 RETURN w;
END $$;
CREATE FUNCTION public.create_team_workspace(n text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.create_team(n) $$;
REVOKE ALL ON FUNCTION private.create_team(text),public.create_team_workspace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.create_team(text),public.create_team_workspace(text) TO authenticated;
CREATE FUNCTION public.workspace_profiles(w uuid) RETURNS SETOF public.profiles LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p.* FROM public.profiles p JOIN public.workspace_members m ON m.user_id=p.id WHERE m.workspace=w
$$;
REVOKE ALL ON FUNCTION public.workspace_profiles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_profiles(uuid) TO authenticated;

-- A recovery grant is created only by the database operator after explicit authorization.
-- No client role or public RPC can create one. Each grant is consumed once and audited.
CREATE TABLE private.membership_recovery_grants (
 workspace uuid NOT NULL,user_id uuid NOT NULL,reason text NOT NULL,authorized_by text NOT NULL,
 expires_at timestamptz NOT NULL,PRIMARY KEY(workspace,user_id)
);
REVOKE ALL ON private.membership_recovery_grants FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.protect_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recovery private.membership_recovery_grants;
BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=OLD.workspace FOR UPDATE;
 DELETE FROM private.membership_recovery_grants WHERE workspace=OLD.workspace AND user_id=OLD.user_id AND expires_at>now() RETURNING * INTO recovery;
 IF recovery.user_id IS NOT NULL THEN
  INSERT INTO public.audit_events(workspace,actor,action,resource_id) VALUES(OLD.workspace,auth.uid(),'membership.authorized_recovery:'||recovery.authorized_by||':'||recovery.reason,OLD.user_id::text);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF OLD.protected_founder THEN RAISE EXCEPTION 'Protected founder: audited recovery required'; END IF;
 IF OLD.role='owner' AND (TG_OP='DELETE' OR NEW.role<>'owner') AND NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace=OLD.workspace AND role='owner' AND user_id<>OLD.user_id)
 THEN RAISE EXCEPTION 'Cannot remove last owner'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.workspace<>OLD.workspace OR NEW.user_id<>OLD.user_id OR NEW.protected_founder<>OLD.protected_founder THEN RAISE EXCEPTION 'Membership identity is immutable'; END IF;
 RETURN NEW;
END $$;
