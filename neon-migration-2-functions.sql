-- ========================================
-- FUNÇÕES RPC
-- ========================================

-- Função para verificar se é admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = coalesce(_user_id, auth.uid())
      and p.role = 'admin'
  );
$$;

-- Função para resetar dados (admin)
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

  TRUNCATE TABLE public.transactions RESTART IDENTITY;
  TRUNCATE TABLE public.payments RESTART IDENTITY;
END;
$$;

-- Função para afiliados paginados
CREATE OR REPLACE FUNCTION public.get_affiliates_paginated(
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 20,
  _start_date timestamptz DEFAULT NULL,
  _end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  afiliados_id text,
  customers bigint,
  ngr_total numeric,
  cpa_pago numeric,
  rev_pago numeric,
  total_recebido numeric,
  roi numeric,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _offset integer;
  _total_count bigint;
BEGIN
  _offset := (_page - 1) * _page_size;
  
  SELECT COUNT(DISTINCT p.afiliados_id)
  INTO _total_count
  FROM public.payments p
  WHERE p.status = 'finish'
    AND (_start_date IS NULL OR p.date >= _start_date)
    AND (_end_date IS NULL OR p.date <= _end_date);
  
  RETURN QUERY
  WITH affiliate_metrics AS (
    SELECT 
      p.afiliados_id,
      COUNT(DISTINCT p.clientes_id) FILTER (WHERE p.clientes_id IS NOT NULL) as customers,
      COALESCE(SUM(p.value) FILTER (WHERE p.method = 'cpa'), 0) as cpa_pago,
      COALESCE(SUM(p.value) FILTER (WHERE p.method = 'rev'), 0) as rev_pago
    FROM public.payments p
    WHERE p.status = 'finish'
      AND (_start_date IS NULL OR p.date >= _start_date)
      AND (_end_date IS NULL OR p.date <= _end_date)
    GROUP BY p.afiliados_id
  ),
  affiliate_with_ngr AS (
    SELECT 
      am.*,
      COALESCE((
        SELECT SUM((t.ggr - t.chargeback) * 0.8)
        FROM public.transactions t
        WHERE t.customer_id IN (
          SELECT DISTINCT p.clientes_id 
          FROM public.payments p 
          WHERE p.afiliados_id = am.afiliados_id 
            AND p.status = 'finish'
            AND p.method = 'cpa'
        )
      ), 0) as ngr_total
    FROM affiliate_metrics am
  )
  SELECT 
    a.afiliados_id,
    a.customers,
    a.ngr_total,
    a.cpa_pago,
    a.rev_pago,
    (a.cpa_pago + a.rev_pago) as total_recebido,
    CASE 
      WHEN (a.cpa_pago + a.rev_pago) > 0 THEN (a.ngr_total / (a.cpa_pago + a.rev_pago)) - 1
      ELSE NULL
    END as roi,
    _total_count
  FROM affiliate_with_ngr a
  ORDER BY a.ngr_total DESC
  LIMIT _page_size
  OFFSET _offset;
END;
$$;

-- Função para tornar usuário admin
CREATE OR REPLACE FUNCTION public.make_user_admin(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can make other users admin';
  END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', target_email;
  END IF;

  INSERT INTO public.profiles (id, role, created_at, updated_at)
  VALUES (target_user_id, 'admin', now(), now())
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    updated_at = now();

  RAISE NOTICE 'User % is now admin', target_email;
END;
$$;

-- Funções para listar semanas
CREATE OR REPLACE FUNCTION public.list_weeks_transactions()
RETURNS TABLE (week_start date, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (date_trunc('week', date AT TIME ZONE 'America/Sao_Paulo'))::date AS week_start,
         count(*)::bigint AS cnt
  FROM public.transactions
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.list_weeks_payments()
RETURNS TABLE (week_start date, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (date_trunc('week', date AT TIME ZONE 'America/Sao_Paulo'))::date AS week_start,
         count(*)::bigint AS cnt
  FROM public.payments
  GROUP BY 1
  ORDER BY 1;
$$;

-- Função para atualizar timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
