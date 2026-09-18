-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Teammate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Leads
CREATE TYPE public.lead_status AS ENUM ('not_contacted', 'contacted', 'replied', 'deal', 'dead');

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER,
  instagram_url TEXT,
  username TEXT NOT NULL,
  email TEXT,
  match_note TEXT,
  status public.lead_status NOT NULL DEFAULT 'not_contacted',
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_touched_at TIMESTAMPTZ,
  last_touched_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_status_idx ON public.leads (status);
CREATE INDEX leads_owner_idx ON public.leads (owner_id);
CREATE INDEX leads_number_idx ON public.leads (number);
CREATE INDEX leads_username_idx ON public.leads (lower(username));
CREATE INDEX leads_email_idx ON public.leads (lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can read leads" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team can update leads" ON public.leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team can insert leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (true);

-- Notes
CREATE TABLE public.lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_notes_lead_idx ON public.lead_notes (lead_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can read notes" ON public.lead_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authors can add notes" ON public.lead_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own notes" ON public.lead_notes FOR UPDATE TO authenticated USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete own notes" ON public.lead_notes FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- Realtime
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.lead_notes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;