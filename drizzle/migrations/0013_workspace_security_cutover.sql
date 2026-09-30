-- Security cutover: run only after the UUID-aware application is deployed and
-- a restorable backup and the legacy workspace mapping have been verified.
-- The expansion phase (0005) intentionally preserved the older policies.

DROP POLICY IF EXISTS "Team can read leads" ON public.leads;
DROP POLICY IF EXISTS "Team can update leads" ON public.leads;
DROP POLICY IF EXISTS "Team can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Team can read notes" ON public.lead_notes;
DROP POLICY IF EXISTS "Authors can add notes" ON public.lead_notes;
DROP POLICY IF EXISTS "Authors can update own notes" ON public.lead_notes;
DROP POLICY IF EXISTS "Authors can delete own notes" ON public.lead_notes;
DROP POLICY IF EXISTS "Team can read stages" ON public.lead_stages;
DROP POLICY IF EXISTS "Team can add stages" ON public.lead_stages;
DROP POLICY IF EXISTS "Team can edit custom stages" ON public.lead_stages;
DROP POLICY IF EXISTS "Team can delete custom stages" ON public.lead_stages;
DROP POLICY IF EXISTS "Team can edit stages" ON public.lead_stages;
DROP POLICY IF EXISTS "Signed-in users can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Team can read email messages" ON public.email_messages;

ALTER TABLE public.lead_stages DROP CONSTRAINT IF EXISTS lead_stages_workspace_key_key;

CREATE OR REPLACE FUNCTION private.seed_stages() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE legacy_key public.workspace_key;
BEGIN
 legacy_key := CASE WHEN NEW.id='00000000-0000-4000-8000-000000000002'::uuid
   THEN 'justin'::public.workspace_key ELSE 'docmesker'::public.workspace_key END;
 INSERT INTO public.lead_stages(workspace,workspace_id,key,label,color,position,is_builtin,base_status)
 SELECT legacy_key,NEW.id,key,label,color,position,true,key::public.lead_status FROM (VALUES
  ('not_contacted','Not contacted','slate',0),('contacted','Contacted','blue',1),
  ('replied','Replied','violet',2),('deal','Deal','emerald',3),('dead','Dead','rose',4)
 ) s(key,label,color,position)
 ON CONFLICT(workspace_id,key) DO NOTHING;
 RETURN NEW;
END $$;

INSERT INTO public.lead_stages(workspace,workspace_id,key,label,color,position,is_builtin,base_status)
SELECT CASE WHEN w.id='00000000-0000-4000-8000-000000000002'::uuid
  THEN 'justin'::public.workspace_key ELSE 'docmesker'::public.workspace_key END,
 w.id,s.key,s.label,s.color,s.position,true,s.key::public.lead_status
FROM public.workspaces w CROSS JOIN (VALUES
 ('not_contacted','Not contacted','slate',0),('contacted','Contacted','blue',1),
 ('replied','Replied','violet',2),('deal','Deal','emerald',3),('dead','Dead','rose',4)
) s(key,label,color,position)
ON CONFLICT(workspace_id,key) DO NOTHING;

CREATE POLICY leads_member_read ON public.leads FOR SELECT TO authenticated
 USING (private.member_role(workspace_id) IS NOT NULL);
CREATE POLICY leads_member_insert ON public.leads FOR INSERT TO authenticated
 WITH CHECK (private.can_write(workspace_id));
CREATE POLICY leads_member_update ON public.leads FOR UPDATE TO authenticated
 USING (private.can_write(workspace_id)) WITH CHECK (private.can_write(workspace_id));
CREATE POLICY leads_admin_delete ON public.leads FOR DELETE TO authenticated
 USING (private.is_admin(workspace_id));

CREATE POLICY notes_member_read ON public.lead_notes FOR SELECT TO authenticated
 USING (private.member_role(workspace_id) IS NOT NULL);
CREATE POLICY notes_member_insert ON public.lead_notes FOR INSERT TO authenticated
 WITH CHECK (private.can_write(workspace_id) AND author_id=auth.uid());
CREATE POLICY notes_author_update ON public.lead_notes FOR UPDATE TO authenticated
 USING (private.can_write(workspace_id) AND author_id=auth.uid())
 WITH CHECK (private.can_write(workspace_id) AND author_id=auth.uid());
CREATE POLICY notes_author_delete ON public.lead_notes FOR DELETE TO authenticated
 USING (private.can_write(workspace_id) AND author_id=auth.uid());

CREATE POLICY stages_member_read ON public.lead_stages FOR SELECT TO authenticated
 USING (private.member_role(workspace_id) IS NOT NULL);
CREATE POLICY stages_admin_insert ON public.lead_stages FOR INSERT TO authenticated
 WITH CHECK (private.is_admin(workspace_id) AND NOT is_builtin);
CREATE POLICY stages_admin_update ON public.lead_stages FOR UPDATE TO authenticated
 USING (private.is_admin(workspace_id) AND NOT is_builtin)
 WITH CHECK (private.is_admin(workspace_id) AND NOT is_builtin);
CREATE POLICY stages_admin_delete ON public.lead_stages FOR DELETE TO authenticated
 USING (private.is_admin(workspace_id) AND NOT is_builtin);

CREATE POLICY profiles_workspace_read ON public.profiles FOR SELECT TO authenticated
 USING (id=auth.uid() OR EXISTS (
   SELECT 1 FROM public.workspace_members mine
   JOIN public.workspace_members theirs ON theirs.workspace=mine.workspace
   WHERE mine.user_id=auth.uid() AND theirs.user_id=profiles.id
   AND private.member_role(mine.workspace) IS NOT NULL
 ));
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT TO authenticated
 WITH CHECK (id=auth.uid());
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
 USING (id=auth.uid()) WITH CHECK (id=auth.uid());

CREATE POLICY messages_workspace_read ON public.email_messages FOR SELECT TO authenticated
 USING (private.member_role(workspace_id) IS NOT NULL AND user_id=auth.uid());

GRANT SELECT,INSERT,UPDATE,DELETE ON public.leads,public.lead_notes,public.lead_stages TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.email_messages TO authenticated;
