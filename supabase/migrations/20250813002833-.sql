-- Update admin_reset_data to use TRUNCATE instead of DELETE (avoids PostgREST safety error)
CREATE OR REPLACE FUNCTION public.admin_reset_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Fast, safe reset
  TRUNCATE TABLE public.transactions RESTART IDENTITY;
  TRUNCATE TABLE public.payments RESTART IDENTITY;
END;
$$;