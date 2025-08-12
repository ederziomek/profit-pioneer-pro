-- Enable extension for UUID generation
create extension if not exists pgcrypto;

-- Create transactions table
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  date timestamptz not null,
  ggr numeric not null,
  chargeback numeric not null,
  deposit numeric not null,
  withdrawal numeric not null,
  created_at timestamptz not null default now()
);

-- Create payments table
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  clientes_id text,
  afiliados_id text not null,
  date timestamptz not null,
  value numeric not null,
  method text not null,
  status text not null,
  classification text not null,
  level int not null,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.transactions enable row level security;
alter table public.payments enable row level security;

-- Policies: allow public read/insert/delete (no auth in app yet)
create policy "Public can view transactions" on public.transactions for select using (true);
create policy "Public can insert transactions" on public.transactions for insert with check (true);
create policy "Public can delete transactions" on public.transactions for delete using (true);

create policy "Public can view payments" on public.payments for select using (true);
create policy "Public can insert payments" on public.payments for insert with check (true);
create policy "Public can delete payments" on public.payments for delete using (true);

-- Helpful indexes
create index if not exists idx_transactions_date on public.transactions(date);
create index if not exists idx_payments_date on public.payments(date);
create index if not exists idx_payments_afiliados on public.payments(afiliados_id);
