CREATE TABLE private.bulk_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace uuid NOT NULL REFERENCES public.workspaces(id),
 actor uuid NOT NULL,
 request_key uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('stage','export')),
 target_stage text,
 filters jsonb NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','cancelled','failed')),
 total integer NOT NULL DEFAULT 0, done integer NOT NULL DEFAULT 0,
 skipped integer NOT NULL DEFAULT 0,
 lease_token uuid, lease_until timestamptz,
 problem text, created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, UNIQUE(workspace,id), UNIQUE(workspace,actor,request_key)
);
CREATE INDEX bulk_jobs_queue ON private.bulk_jobs(state,lease_until,created_at);
CREATE TABLE private.bulk_job_items (
 job_id uuid NOT NULL REFERENCES private.bulk_jobs(id),
 workspace uuid NOT NULL, lead_id uuid NOT NULL,
 original_stage text, position bigint NOT NULL,
 processed boolean NOT NULL DEFAULT false,
 skipped boolean NOT NULL DEFAULT false,
 csv_line text,
 PRIMARY KEY(job_id,lead_id), UNIQUE(job_id,position)
);
CREATE INDEX bulk_job_pending ON private.bulk_job_items(job_id,position) WHERE NOT processed;
CREATE TABLE private.bulk_downloads (
 token_hash text PRIMARY KEY, workspace uuid NOT NULL,
 job_id uuid NOT NULL REFERENCES private.bulk_jobs(id),
 actor uuid NOT NULL, expires_at timestamptz NOT NULL,
 used_at timestamptz
);
REVOKE ALL ON private.bulk_jobs,private.bulk_job_items,private.bulk_downloads FROM PUBLIC,anon,authenticated;
