CREATE OR REPLACE FUNCTION public.protect_builtin_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_builtin THEN
    NEW.key := OLD.key;
    NEW.is_builtin := true;
    NEW.workspace := OLD.workspace;
    NEW.base_status := OLD.base_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_builtin_stage ON public.lead_stages;
CREATE TRIGGER protect_builtin_stage
BEFORE UPDATE ON public.lead_stages
FOR EACH ROW EXECUTE FUNCTION public.protect_builtin_stage();

DROP POLICY IF EXISTS "Team can edit custom stages" ON public.lead_stages;
CREATE POLICY "Team can edit stages"
ON public.lead_stages
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);