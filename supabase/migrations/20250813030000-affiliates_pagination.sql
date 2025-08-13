-- Function to get paginated affiliates with computed metrics
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
  -- Calculate offset
  _offset := (_page - 1) * _page_size;
  
  -- Get total count first
  SELECT COUNT(DISTINCT p.afiliados_id)
  INTO _total_count
  FROM public.payments p
  WHERE p.status = 'finish'
    AND (_start_date IS NULL OR p.date >= _start_date)
    AND (_end_date IS NULL OR p.date <= _end_date);
  
  -- Return paginated results with total count
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
      -- Calculate NGR from transactions (simplified - you may need to adjust this logic)
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_affiliates_paginated(integer, integer, timestamptz, timestamptz) TO authenticated;