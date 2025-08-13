-- Admin reset function to clear data atomically and bypass RLS (with admin check)
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

  -- Remove all rows (keeps schema & indexes)
  DELETE FROM public.transactions;
  DELETE FROM public.payments;
END;
$$;
