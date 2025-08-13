-- Function to make a user admin (only existing admins can use this)
CREATE OR REPLACE FUNCTION public.make_user_admin(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Check if current user is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can make other users admin';
  END IF;

  -- Find the user by email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', target_email;
  END IF;

  -- Update or insert the profile with admin role
  INSERT INTO public.profiles (id, role, created_at, updated_at)
  VALUES (target_user_id, 'admin', now(), now())
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    updated_at = now();

  RAISE NOTICE 'User % is now admin', target_email;
END;
$$;

-- Grant execute permission to authenticated users (RLS will still enforce admin check)
GRANT EXECUTE ON FUNCTION public.make_user_admin(text) TO authenticated;