-- Fallback: use triggers to populate natural_key (no immutability requirement)

-- Transactions
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS natural_key text;

CREATE OR REPLACE FUNCTION public.set_transactions_natural_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.natural_key := md5(
    coalesce(NEW.customer_id,'') || '|' ||
    coalesce(extract(epoch from NEW.date)::text,'') || '|' ||
    coalesce(NEW.ggr::text,'') || '|' ||
    coalesce(NEW.chargeback::text,'') || '|' ||
    coalesce(NEW.deposit::text,'') || '|' ||
    coalesce(NEW.withdrawal::text,'')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_natural_key ON public.transactions;
CREATE TRIGGER trg_transactions_natural_key
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.set_transactions_natural_key();

CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_natural_key
ON public.transactions (natural_key);

-- Payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS natural_key text;

CREATE OR REPLACE FUNCTION public.set_payments_natural_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.natural_key := md5(
    coalesce(NEW.afiliados_id,'') || '|' ||
    coalesce(NEW.clientes_id,'') || '|' ||
    coalesce(extract(epoch from NEW.date)::text,'') || '|' ||
    coalesce(NEW.value::text,'') || '|' ||
    coalesce(NEW.method,'') || '|' ||
    coalesce(NEW.status,'') || '|' ||
    coalesce(NEW.classification,'') || '|' ||
    coalesce(NEW.level::text,'')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_natural_key ON public.payments;
CREATE TRIGGER trg_payments_natural_key
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_payments_natural_key();

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_natural_key
ON public.payments (natural_key);
