-- ========================================
-- CONFIGURAÇÃO RLS E POLÍTICAS
-- ========================================

-- Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
DROP POLICY IF EXISTS "Users can view their profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their profile" ON public.profiles;
DROP POLICY IF EXISTS "Only admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Users can view their profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can insert their profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "Only admins can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Políticas para transactions
DROP POLICY IF EXISTS "Authenticated can view transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can delete transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can update transactions" ON public.transactions;

CREATE POLICY "Authenticated can view transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert transactions"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admins can delete transactions"
ON public.transactions
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can update transactions"
ON public.transactions
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Políticas para payments
DROP POLICY IF EXISTS "Authenticated can view payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;

CREATE POLICY "Authenticated can view payments"
ON public.payments
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admins can delete payments"
ON public.payments
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Conceder permissões
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_affiliates_paginated(integer, integer, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.make_user_admin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_weeks_transactions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_weeks_payments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
