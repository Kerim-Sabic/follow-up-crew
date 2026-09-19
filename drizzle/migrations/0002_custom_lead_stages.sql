CREATE TABLE public.lead_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace public.workspace_key NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  color text NOT NULL DEFAULT 'slate',
  position integer NOT NULL DEFAULT 0,
  is_builtin boolean NOT NULL DEFAULT false,
  base_status public.lead_status NOT NULL DEFAULT 'contacted',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_stages TO authenticated;
GRANT ALL ON public.lead_stages TO service_role;

ALTER TABLE public.lead_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can read stages" ON public.lead_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team can add stages" ON public.lead_stages FOR INSERT TO authenticated WITH CHECK (NOT is_builtin);
CREATE POLICY "Team can edit custom stages" ON public.lead_stages FOR UPDATE TO authenticated USING (NOT is_builtin) WITH CHECK (NOT is_builtin);
CREATE POLICY "Team can delete custom stages" ON public.lead_stages FOR DELETE TO authenticated USING (NOT is_builtin);

INSERT INTO public.lead_stages (workspace, key, label, color, position, is_builtin, base_status)
SELECT w.key::public.workspace_key, s.key, s.label, s.color, s.position, true, s.key::public.lead_status
FROM (VALUES ('docmesker'), ('justin')) AS w(key)
CROSS JOIN (VALUES
  ('not_contacted', 'Not contacted', 'slate', 0),
  ('contacted', 'Contacted', 'blue', 1),
  ('replied', 'Replied', 'violet', 2),
  ('deal', 'Deal', 'emerald', 3),
  ('dead', 'Dead', 'rose', 4)
) AS s(key, label, color, position);

ALTER TABLE public.leads ADD COLUMN stage text;
UPDATE public.leads SET stage = status::text WHERE stage IS NULL;
ALTER TABLE public.leads ALTER COLUMN stage SET DEFAULT 'not_contacted';

CREATE OR REPLACE FUNCTION public.sync_lead_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base public.lead_status;
BEGIN
  IF NEW.stage IS NULL THEN
    NEW.stage := NEW.status::text;
    RETURN NEW;
  END IF;

  IF NEW.stage IN ('not_contacted', 'contacted', 'replied', 'deal', 'dead') THEN
    NEW.status := NEW.stage::public.lead_status;
  ELSE
    SELECT s.base_status INTO base FROM public.lead_stages s
      WHERE s.workspace = NEW.workspace AND s.key = NEW.stage;
    NEW.status := COALESCE(base, 'contacted'::public.lead_status);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_sync_stage
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.sync_lead_stage();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_stages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;