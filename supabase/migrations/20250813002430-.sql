-- Promote specific user to admin
-- Ensure profile exists and set role to admin for the given email
INSERT INTO public.profiles (id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
WHERE lower(u.email) = lower('ederziomek@gmail.com')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;