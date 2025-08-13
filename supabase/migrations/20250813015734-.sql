-- Create functions to list all weeks with data for transactions and payments
-- Uses Sao Paulo timezone to group by calendar weeks starting Monday

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