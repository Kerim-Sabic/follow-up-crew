-- Stage 1 of a staged, backward-compatible rollout. Back up and rehearse first; nothing is dropped or renamed.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TABLE public.workspaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('personal','team','internal','legacy_review')),
 personal_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
 timezone text NOT NULL DEFAULT 'UTC', research_enabled boolean NOT NULL DEFAULT false,
 sending_enabled boolean NOT NULL DEFAULT false, complimentary boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.workspaces(id,name,kind,timezone,complimentary) VALUES
 ('00000000-0000-4000-8000-000000000001','DocMesKer','internal','Europe/Sarajevo',true),
 ('00000000-0000-4000-8000-000000000002','Justin — ownership review','legacy_review','UTC',false);
CREATE TABLE public.workspace_members (
 workspace uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
 protected_founder boolean NOT NULL DEFAULT false, PRIMARY KEY(workspace,user_id)
);
CREATE INDEX workspace_members_user ON public.workspace_members(user_id,workspace);
CREATE TABLE public.developer_entitlements (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 verified_email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace uuid NOT NULL REFERENCES public.workspaces(id),
 email text NOT NULL, role text NOT NULL CHECK(role IN ('admin','member','viewer')),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 invited_by uuid NOT NULL REFERENCES auth.users(id), accepted_by uuid REFERENCES auth.users(id),
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace uuid REFERENCES public.workspaces(id),
 actor uuid, action text NOT NULL, resource_id text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION private.member_role(w uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
 SELECT m.role FROM public.workspace_members m JOIN auth.users u ON u.id=m.user_id
 WHERE m.workspace=w AND m.user_id=auth.uid() AND u.email_confirmed_at IS NOT NULL
$$;
CREATE FUNCTION private.can_write(w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT coalesce(private.member_role(w) IN ('owner','admin','member'),false) $$;
CREATE FUNCTION private.is_admin(w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT coalesce(private.member_role(w) IN ('owner','admin'),false) $$;

-- Bootstrap verified identities only; never sends invitations or marks emails verified.
CREATE FUNCTION private.bootstrap_user(uid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE em text; confirmed timestamptz; personal uuid;
BEGIN
 SELECT lower(trim(email)),email_confirmed_at INTO em,confirmed FROM auth.users WHERE id=uid;
 IF confirmed IS NULL THEN RETURN; END IF;
 INSERT INTO public.workspaces(name,kind,personal_user_id) VALUES ('Personal workspace','personal',uid)
 ON CONFLICT(personal_user_id) DO NOTHING;
 SELECT id INTO personal FROM public.workspaces WHERE personal_user_id=uid;
 INSERT INTO public.workspace_members VALUES(personal,uid,'owner',false) ON CONFLICT DO NOTHING;
 IF em IN ('kerim.sabic@gmail.com','mehmed.barlov@gmail.com','amrudin.naser@gmail.com') THEN
   INSERT INTO public.developer_entitlements(user_id,verified_email) VALUES(uid,em)
   ON CONFLICT(user_id) DO UPDATE SET verified_email=excluded.verified_email;
   INSERT INTO public.workspace_members VALUES('00000000-0000-4000-8000-000000000001',uid,
     CASE WHEN em='kerim.sabic@gmail.com' THEN 'owner' ELSE 'admin' END,true) ON CONFLICT DO NOTHING;
 END IF;
END $$;
CREATE FUNCTION private.on_verified_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$ BEGIN PERFORM private.bootstrap_user(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER creator_verified_user AFTER INSERT OR UPDATE OF email_confirmed_at,email ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.on_verified_user();
DO $$ DECLARE u record; BEGIN FOR u IN SELECT id FROM auth.users LOOP PERFORM private.bootstrap_user(u.id); END LOOP; END $$;

CREATE FUNCTION private.founder_identity_ok(w uuid, uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.workspace_members m JOIN auth.users u ON u.id=m.user_id
 WHERE m.workspace=w AND m.user_id=uid AND u.email_confirmed_at IS NOT NULL
 AND (NOT m.protected_founder OR lower(trim(u.email)) IN ('kerim.sabic@gmail.com','mehmed.barlov@gmail.com','amrudin.naser@gmail.com')))
$$;
CREATE OR REPLACE FUNCTION private.member_role(w uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT role FROM public.workspace_members WHERE workspace=w AND user_id=auth.uid()
 AND private.founder_identity_ok(w,auth.uid()) $$;

CREATE FUNCTION private.protect_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=OLD.workspace FOR UPDATE;
 IF OLD.protected_founder THEN RAISE EXCEPTION 'Protected founder: audited recovery required'; END IF;
 IF OLD.role='owner' AND (TG_OP='DELETE' OR NEW.role<>'owner') AND NOT EXISTS
 (SELECT 1 FROM public.workspace_members WHERE workspace=OLD.workspace AND role='owner' AND user_id<>OLD.user_id)
 THEN RAISE EXCEPTION 'Cannot remove last owner'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.workspace<>OLD.workspace OR NEW.user_id<>OLD.user_id OR NEW.protected_founder<>OLD.protected_founder
 THEN RAISE EXCEPTION 'Membership identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_membership BEFORE UPDATE OR DELETE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION private.protect_membership();

-- STAGE 1 (backward compatible). The legacy enum column `workspace` keeps its meaning and values
-- for the currently deployed app. The UUID scope lives in a NEW column `workspace_id`; old and new
-- code never read the same column with different meanings. Legacy policies and triggers stay;
-- membership policies are added alongside them. Stage 2 (separate, later) retires legacy access
-- only after every user's membership is verified.
CREATE TABLE private.rollout (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), stage integer NOT NULL DEFAULT 1 CHECK(stage IN (1,2)));
INSERT INTO private.rollout DEFAULT VALUES;
CREATE FUNCTION private.legacy_open() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT stage=1 FROM private.rollout),true) $$;
CREATE FUNCTION private.workspace_of_key(k public.workspace_key) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE k WHEN 'docmesker' THEN '00000000-0000-4000-8000-000000000001'::uuid WHEN 'justin' THEN '00000000-0000-4000-8000-000000000002'::uuid END $$;
CREATE FUNCTION private.key_of_workspace(w uuid) RETURNS public.workspace_key LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE w WHEN '00000000-0000-4000-8000-000000000001'::uuid THEN 'docmesker'::public.workspace_key
 WHEN '00000000-0000-4000-8000-000000000002'::uuid THEN 'justin'::public.workspace_key END $$;

ALTER TABLE public.leads ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
ALTER TABLE public.lead_stages ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
ALTER TABLE public.email_messages ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
ALTER TABLE public.lead_notes ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);
COMMENT ON COLUMN public.leads.workspace IS 'LEGACY label read by pre-cutover app; kept in sync with workspace_id';
COMMENT ON COLUMN public.leads.workspace_id IS 'Workspace scope (uuid) for membership-based access';
-- Backfill (protect_builtin_stage ignores workspace_id; legacy triggers keep working).
UPDATE public.leads SET workspace_id=private.workspace_of_key(workspace);
UPDATE public.lead_stages SET workspace_id=private.workspace_of_key(workspace);
UPDATE public.email_messages e SET workspace_id=coalesce((SELECT l.workspace_id FROM public.leads l WHERE l.id=e.lead_id),private.workspace_of_key(e.workspace));
UPDATE public.lead_notes n SET workspace_id=l.workspace_id FROM public.leads l WHERE l.id=n.lead_id;
ALTER TABLE public.leads ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.lead_stages ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.email_messages ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.lead_notes ALTER COLUMN workspace_id SET NOT NULL;
-- New workspaces have no legacy label; their stage rows carry NULL there (legacy app filters by label, so never sees them).
ALTER TABLE public.lead_stages ALTER COLUMN workspace DROP NOT NULL;
ALTER TABLE public.lead_stages ADD CONSTRAINT lead_stages_scope_key UNIQUE(workspace_id,key);
ALTER TABLE public.leads ADD CONSTRAINT leads_scope_id UNIQUE(workspace_id,id);
ALTER TABLE public.email_messages ADD CONSTRAINT email_lead_scope FOREIGN KEY(workspace_id,lead_id) REFERENCES public.leads(workspace_id,id);
ALTER TABLE public.lead_notes ADD CONSTRAINT note_lead_scope FOREIGN KEY(workspace_id,lead_id) REFERENCES public.leads(workspace_id,id);
CREATE INDEX leads_scope_stage ON public.leads(workspace_id,stage,id);
CREATE INDEX leads_scope_handle ON public.leads(workspace_id,lower(username));
CREATE INDEX notes_scope ON public.lead_notes(workspace_id,lead_id,created_at);
CREATE INDEX messages_scope ON public.email_messages(workspace_id,user_id,sent_at DESC);

-- Keeps label and uuid consistent for both old writers (label only) and new writers (uuid).
-- Named a_* so it fires before the other BEFORE triggers on these tables.
CREATE FUNCTION private.sync_scope() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.workspace IS DISTINCT FROM OLD.workspace
  THEN RAISE EXCEPTION 'Use an authorized copy operation to move data'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='email_messages' AND NEW.workspace_id IS NULL AND NEW.lead_id IS NOT NULL THEN
  SELECT workspace_id INTO NEW.workspace_id FROM public.leads WHERE id=NEW.lead_id;
 END IF;
 IF NEW.workspace_id IS NULL THEN NEW.workspace_id:=private.workspace_of_key(NEW.workspace);
 ELSE
  NEW.workspace:=private.key_of_workspace(NEW.workspace_id);
  IF NEW.workspace IS NULL AND TG_TABLE_NAME<>'lead_stages' THEN
   RAISE EXCEPTION 'Workspace opens for leads after the stage-2 cutover'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_sync_scope BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION private.sync_scope();
CREATE TRIGGER a_sync_scope BEFORE INSERT OR UPDATE ON public.lead_stages FOR EACH ROW EXECUTE FUNCTION private.sync_scope();
CREATE TRIGGER a_sync_scope BEFORE INSERT OR UPDATE ON public.email_messages FOR EACH ROW EXECUTE FUNCTION private.sync_scope();
CREATE FUNCTION private.scope_note() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN RAISE EXCEPTION 'Use an authorized copy operation to move data'; END IF;
 ELSIF NEW.workspace_id IS NULL THEN SELECT workspace_id INTO NEW.workspace_id FROM public.leads WHERE id=NEW.lead_id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_scope_note BEFORE INSERT OR UPDATE ON public.lead_notes FOR EACH ROW EXECUTE FUNCTION private.scope_note();
-- public.sync_lead_stage and protect_builtin_stage are intentionally left unchanged (label-based, still consistent).

-- Membership policies are ADDED next to the legacy team policies (permissive policies OR together),
-- so nobody loses or gains visibility during stage 1. Stage 2 drops the legacy ones.
CREATE POLICY leads_read ON public.leads FOR SELECT TO authenticated USING(private.member_role(workspace_id) IS NOT NULL);
CREATE POLICY leads_insert ON public.leads FOR INSERT TO authenticated WITH CHECK(private.can_write(workspace_id));
CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated USING(private.can_write(workspace_id)) WITH CHECK(private.can_write(workspace_id));
CREATE POLICY leads_delete ON public.leads FOR DELETE TO authenticated USING(private.is_admin(workspace_id));
CREATE POLICY notes_read ON public.lead_notes FOR SELECT TO authenticated USING(private.member_role(workspace_id) IS NOT NULL);
CREATE POLICY notes_insert ON public.lead_notes FOR INSERT TO authenticated WITH CHECK(private.can_write(workspace_id) AND author_id=auth.uid());
CREATE POLICY notes_update ON public.lead_notes FOR UPDATE TO authenticated USING(private.can_write(workspace_id) AND author_id=auth.uid()) WITH CHECK(private.can_write(workspace_id) AND author_id=auth.uid());
CREATE POLICY notes_delete ON public.lead_notes FOR DELETE TO authenticated USING(private.can_write(workspace_id) AND author_id=auth.uid());
CREATE POLICY stages_read ON public.lead_stages FOR SELECT TO authenticated USING(private.member_role(workspace_id) IS NOT NULL);
CREATE POLICY stages_insert ON public.lead_stages FOR INSERT TO authenticated WITH CHECK(private.is_admin(workspace_id) AND NOT is_builtin);
CREATE POLICY stages_update ON public.lead_stages FOR UPDATE TO authenticated USING(private.is_admin(workspace_id)) WITH CHECK(private.is_admin(workspace_id));
CREATE POLICY stages_delete ON public.lead_stages FOR DELETE TO authenticated USING(private.is_admin(workspace_id) AND NOT is_builtin);
CREATE POLICY messages_read ON public.email_messages FOR SELECT TO authenticated USING(private.member_role(workspace_id) IS NOT NULL AND user_id=auth.uid());
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid() OR EXISTS
 (SELECT 1 FROM public.workspace_members m WHERE m.user_id=id AND private.member_role(m.workspace) IS NOT NULL));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.leads,public.lead_notes,public.lead_stages TO authenticated;
GRANT SELECT ON public.email_messages,public.profiles TO authenticated;
GRANT ALL ON public.leads,public.lead_notes,public.lead_stages,public.email_messages,public.profiles TO service_role;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspaces,public.workspace_members,public.developer_entitlements,public.workspace_invitations,public.audit_events FROM anon,authenticated;
GRANT SELECT ON public.workspaces,public.workspace_members,public.developer_entitlements,public.audit_events TO authenticated;
GRANT ALL ON public.workspaces,public.workspace_members,public.developer_entitlements,public.workspace_invitations,public.audit_events TO service_role;
CREATE POLICY workspace_read ON public.workspaces FOR SELECT TO authenticated USING(private.member_role(id) IS NOT NULL);
CREATE POLICY members_read ON public.workspace_members FOR SELECT TO authenticated USING(private.member_role(workspace) IS NOT NULL);
CREATE POLICY entitlement_read ON public.developer_entitlements FOR SELECT TO authenticated USING(user_id=auth.uid() AND EXISTS
 (SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND lower(trim(u.email))=verified_email));
-- auth.users is not exposed to authenticated; use a definer helper for entitlement check.
CREATE FUNCTION private.is_developer() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.developer_entitlements d JOIN auth.users u ON u.id=d.user_id
 WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND lower(trim(u.email))=d.verified_email)
$$;
DROP POLICY entitlement_read ON public.developer_entitlements;
CREATE POLICY entitlement_read ON public.developer_entitlements FOR SELECT TO authenticated USING(user_id=auth.uid() AND private.is_developer());
CREATE POLICY audit_read ON public.audit_events FOR SELECT TO authenticated USING(private.is_admin(workspace));

CREATE FUNCTION private.create_invitation(w uuid, em text, r text, h text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF NOT private.is_admin(w) OR r NOT IN ('admin','member','viewer') OR length(h)<>64
 OR em NOT LIKE '%@%' THEN RAISE EXCEPTION 'Invalid invitation or permission denied'; END IF;
 INSERT INTO public.workspace_invitations(workspace,email,role,token_hash,expires_at,invited_by)
 VALUES(w,lower(trim(em)),r,h,now()+interval '7 days',auth.uid()) RETURNING id INTO result;
 INSERT INTO public.audit_events(workspace,actor,action,resource_id) VALUES(w,auth.uid(),'invitation.created',result::text);
 RETURN result;
END $$;
CREATE FUNCTION public.create_workspace_invitation(w uuid, em text, r text, h text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.create_invitation(w,em,r,h) $$;
CREATE FUNCTION private.accept_invitation(h text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inv public.workspace_invitations; em text;
BEGIN
 SELECT lower(trim(email)) INTO em FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 SELECT * INTO inv FROM public.workspace_invitations WHERE token_hash=h FOR UPDATE;
 IF inv.id IS NULL OR inv.email IS DISTINCT FROM em OR inv.expires_at<=now() OR inv.revoked_at IS NOT NULL OR inv.accepted_by IS NOT NULL
 THEN RAISE EXCEPTION 'Invitation invalid, expired or already used'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace=inv.workspace AND user_id=inv.invited_by AND role IN ('owner','admin'))
 THEN RAISE EXCEPTION 'Inviter no longer authorized'; END IF;
 INSERT INTO public.workspace_members VALUES(inv.workspace,auth.uid(),inv.role,false) ON CONFLICT DO NOTHING;
 UPDATE public.workspace_invitations SET accepted_by=auth.uid() WHERE id=inv.id;
 INSERT INTO public.audit_events(workspace,actor,action,resource_id) VALUES(inv.workspace,auth.uid(),'invitation.accepted',inv.id::text);
 RETURN inv.workspace;
END $$;
CREATE FUNCTION public.accept_workspace_invitation(h text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.accept_invitation(h) $$;
CREATE FUNCTION private.manage_member(w uuid, uid uuid, r text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF private.member_role(w)<>'owner' OR private.member_role(w) IS NULL THEN RAISE EXCEPTION 'Owner required'; END IF;
 IF r IS NULL THEN DELETE FROM public.workspace_members WHERE workspace=w AND user_id=uid;
 ELSE UPDATE public.workspace_members SET role=r WHERE workspace=w AND user_id=uid; END IF;
 INSERT INTO public.audit_events(workspace,actor,action,resource_id) VALUES(w,auth.uid(),'membership.changed',uid::text);
END $$;
CREATE FUNCTION public.manage_workspace_member(w uuid, uid uuid, r text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.manage_member(w,uid,r) $$;
CREATE FUNCTION private.revoke_invitation(i uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN UPDATE public.workspace_invitations SET revoked_at=now() WHERE id=i AND private.is_admin(workspace); END $$;
CREATE FUNCTION public.revoke_workspace_invitation(i uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.revoke_invitation(i) $$;

CREATE FUNCTION private.seed_stages() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.lead_stages(workspace_id,key,label,color,position,is_builtin,base_status)
 SELECT NEW.id,key,label,color,position,true,key::public.lead_status FROM (VALUES
 ('not_contacted','Not contacted','slate',0),('contacted','Contacted','blue',1),('replied','Replied','violet',2),('deal','Deal','emerald',3),('dead','Dead','rose',4)) s(key,label,color,position);
 RETURN NEW;
END $$;
CREATE TRIGGER seed_workspace_stages AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION private.seed_stages();
INSERT INTO public.lead_stages(workspace_id,key,label,color,position,is_builtin,base_status)
SELECT w.id,s.key,s.label,s.color,s.position,true,s.key::public.lead_status FROM public.workspaces w CROSS JOIN
 (VALUES ('not_contacted','Not contacted','slate',0),('contacted','Contacted','blue',1),('replied','Replied','violet',2),('deal','Deal','emerald',3),('dead','Dead','rose',4)) s(key,label,color,position)
ON CONFLICT(workspace_id,key) DO NOTHING;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.member_role(uuid),private.can_write(uuid),private.is_admin(uuid),private.is_developer(),private.founder_identity_ok(uuid,uuid),private.create_invitation(uuid,text,text,text),private.accept_invitation(text),private.manage_member(uuid,uuid,text),private.revoke_invitation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_workspace_invitation(uuid,text,text,text),public.accept_workspace_invitation(text),public.manage_workspace_member(uuid,uuid,text),public.revoke_workspace_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation(uuid,text,text,text),public.accept_workspace_invitation(text),public.manage_workspace_member(uuid,uuid,text),public.revoke_workspace_invitation(uuid) TO authenticated;
