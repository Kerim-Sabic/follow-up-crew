-- Recovery hotfix for the deployed additive workspace schema.
-- Applied through Lovable Cloud SQL editor on 2026-10-04 (Europe/Warsaw).
-- No lead/note rows or access policies change. Safe to reapply.
-- A boolean AND does not guard a missing field on the trigger's NEW record:
-- lead_notes has workspace_id, but no legacy workspace column.
CREATE OR REPLACE FUNCTION private.sync_legacy_workspace()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    IF TG_TABLE_NAME = 'lead_notes' THEN
      SELECT workspace_id INTO NEW.workspace_id
      FROM public.leads WHERE id = NEW.lead_id;
    ELSE
      NEW.workspace_id := CASE WHEN NEW.workspace = 'docmesker'
        THEN '00000000-0000-4000-8000-000000000001'::uuid
        ELSE '00000000-0000-4000-8000-000000000002'::uuid END;
    END IF;
  END IF;
  IF TG_TABLE_NAME <> 'lead_notes' THEN
    IF NEW.workspace IS NULL THEN
      NEW.workspace := 'docmesker';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
