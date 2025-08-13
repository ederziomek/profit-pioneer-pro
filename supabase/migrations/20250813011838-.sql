-- Add unique indexes to support proper upsert de-duplication
create unique index if not exists idx_transactions_natural_key on public.transactions (natural_key) where natural_key is not null;
create unique index if not exists idx_payments_natural_key on public.payments (natural_key) where natural_key is not null;