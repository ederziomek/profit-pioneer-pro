-- Fix upsert failures by replacing partial unique indexes with proper unique constraints
DROP INDEX IF EXISTS public.idx_transactions_natural_key;
DROP INDEX IF EXISTS public.idx_payments_natural_key;

-- Create unique constraints so ON CONFLICT (natural_key) works reliably
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_natural_key_uniq UNIQUE (natural_key);

ALTER TABLE public.payments
  ADD CONSTRAINT payments_natural_key_uniq UNIQUE (natural_key);
