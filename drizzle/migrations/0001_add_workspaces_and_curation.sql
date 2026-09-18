DO $$ BEGIN
  CREATE TYPE public.workspace_key AS ENUM ('docmesker', 'justin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS workspace public.workspace_key NOT NULL DEFAULT 'docmesker',
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS niche text,
  ADD COLUMN IF NOT EXISTS curation text,
  ADD COLUMN IF NOT EXISTS score integer,
  ADD COLUMN IF NOT EXISTS evidence text;

CREATE INDEX IF NOT EXISTS leads_workspace_idx ON public.leads (workspace, number);
