-- Retry: use immutable expression (extract epoch) for generated natural keys
-- Transactions natural key
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS natural_key text GENERATED ALWAYS AS (
  md5(
    coalesce(customer_id,'') || '|' ||
    coalesce(extract(epoch from date)::text,'') || '|' ||
    coalesce(ggr::text,'') || '|' ||
    coalesce(chargeback::text,'') || '|' ||
    coalesce(deposit::text,'') || '|' ||
    coalesce(withdrawal::text,'')
  )
) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_natural_key
ON public.transactions (natural_key);

-- Payments natural key
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS natural_key text GENERATED ALWAYS AS (
  md5(
    coalesce(afiliados_id,'') || '|' ||
    coalesce(clientes_id,'') || '|' ||
    coalesce(extract(epoch from date)::text,'') || '|' ||
    coalesce(value::text,'') || '|' ||
    coalesce(method,'') || '|' ||
    coalesce(status,'') || '|' ||
    coalesce(classification,'') || '|' ||
    coalesce(level::text,'')
  )
) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_natural_key
ON public.payments (natural_key);
