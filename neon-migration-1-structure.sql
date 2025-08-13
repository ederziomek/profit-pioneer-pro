-- ========================================
-- ESTRUTURA DO BANCO DE DADOS
-- ========================================

-- 1. Tipos enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END$$;

-- 2. Tabela profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Tabela transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id SERIAL PRIMARY KEY,
  customer_id text NOT NULL,
  date timestamptz NOT NULL,
  ggr numeric NOT NULL DEFAULT 0,
  chargeback numeric NOT NULL DEFAULT 0,
  deposit numeric NOT NULL DEFAULT 0,
  withdrawal numeric NOT NULL DEFAULT 0,
  natural_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Tabela payments
CREATE TABLE IF NOT EXISTS public.payments (
  id SERIAL PRIMARY KEY,
  clientes_id text,
  afiliados_id text NOT NULL,
  date timestamptz NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  method text NOT NULL,
  status text NOT NULL,
  classification text,
  level integer,
  natural_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date);
CREATE INDEX IF NOT EXISTS idx_payments_afiliados_id ON public.payments(afiliados_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments(method);
