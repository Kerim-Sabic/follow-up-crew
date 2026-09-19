-- Per-user connected Gmail mailboxes (server-only access)
CREATE TABLE public.mail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL DEFAULT 'google_mail',
  app_user_id text NOT NULL UNIQUE,
  email text,
  display_name text,
  connection_key_ciphertext text,
  reconnect_required boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mail_accounts_user_idx ON public.mail_accounts(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_accounts TO service_role;
ALTER TABLE public.mail_accounts ENABLE ROW LEVEL SECURITY;

-- Sent and received email tied to leads
CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace public.workspace_key NOT NULL DEFAULT 'docmesker',
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  mail_account_id uuid REFERENCES public.mail_accounts(id) ON DELETE SET NULL,
  user_id uuid,
  direction text NOT NULL CHECK (direction IN ('out','in')),
  gmail_message_id text,
  gmail_thread_id text,
  from_email text,
  to_email text,
  subject text,
  snippet text,
  body text,
  is_read boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gmail_message_id)
);
CREATE INDEX email_messages_lead_idx ON public.email_messages(lead_id);
CREATE INDEX email_messages_workspace_idx ON public.email_messages(workspace, sent_at DESC);
CREATE INDEX email_messages_thread_idx ON public.email_messages(gmail_thread_id);

GRANT SELECT ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can read email messages" ON public.email_messages
  FOR SELECT TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.email_messages;