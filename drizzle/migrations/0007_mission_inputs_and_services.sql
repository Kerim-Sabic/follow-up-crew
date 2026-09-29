ALTER TABLE public.missions ADD COLUMN candidates jsonb NOT NULL DEFAULT '[]', ADD COLUMN discovery_done boolean NOT NULL DEFAULT false,
 ADD COLUMN use_ai boolean NOT NULL DEFAULT false, ADD COLUMN plan_hash text;
CREATE TABLE private.mail_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace uuid NOT NULL REFERENCES public.workspaces(id),
 lead_id uuid NOT NULL, actor uuid NOT NULL, mailbox_id uuid NOT NULL, approval_hash text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent')), is_reply boolean NOT NULL,
 provider_message_id text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace,approval_hash), FOREIGN KEY(workspace,lead_id) REFERENCES public.leads(workspace,id)
);
CREATE UNIQUE INDEX initial_contact_once ON private.mail_outbox(workspace,lead_id) WHERE NOT is_reply;
REVOKE ALL ON private.mail_outbox FROM PUBLIC,anon,authenticated;
CREATE TABLE public.usage_settlements (
 attempt_id uuid PRIMARY KEY REFERENCES public.usage_attempts(id),workspace uuid NOT NULL REFERENCES public.workspaces(id),
 amount_nanos bigint NOT NULL CHECK(amount_nanos>=0),pricing_snapshot jsonb NOT NULL,
 measurement text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.usage_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usage_settlements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.usage_settlements TO authenticated;
CREATE POLICY settlement_scope ON public.usage_settlements FOR SELECT TO authenticated USING(private.member_role(workspace) IS NOT NULL);
CREATE FUNCTION private.immutable_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Ledger events are immutable; append a reconciliation event'; END $$;
CREATE TRIGGER settlement_immutable BEFORE UPDATE OR DELETE ON public.usage_settlements FOR EACH ROW EXECUTE FUNCTION private.immutable_ledger();
ALTER TABLE private.provider_connections DROP CONSTRAINT provider_connections_provider_check;
ALTER TABLE private.provider_connections ADD CHECK(provider IN ('deepseek','brave','modash'));
