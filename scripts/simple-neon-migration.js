#!/usr/bin/env node

/**
 * Script de migração simplificado para Neon
 * 
 * Como usar:
 * 1. Crie um projeto em: https://neon.tech
 * 2. Copie a string de conexão
 * 3. Configure: export NEON_DATABASE_URL="sua_string_aqui"
 * 4. Execute: node scripts/simple-neon-migration.js
 */

console.log('🚀 Migração para Neon - Profit Pioneer Pro');
console.log('='.repeat(60));
console.log('');

// Verificar se a string de conexão está configurada
const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL;

if (!NEON_DATABASE_URL) {
  console.log('❌ NEON_DATABASE_URL não configurada');
  console.log('');
  console.log('📋 Como configurar:');
  console.log('1. Acesse: https://neon.tech');
  console.log('2. Crie um novo projeto');
  console.log('3. Copie a string de conexão');
  console.log('4. Configure: export NEON_DATABASE_URL="sua_string_aqui"');
  console.log('');
  console.log('🔗 Exemplo de string de conexão:');
  console.log('postgresql://user:password@host/database?sslmode=require');
  console.log('');
  process.exit(1);
}

console.log('✅ NEON_DATABASE_URL configurada');
console.log('');

// SQL para criar a estrutura do banco
const CREATE_STRUCTURE_SQL = `
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
`;

// SQL para criar funções RPC
const CREATE_FUNCTIONS_SQL = `
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
`;

// SQL para configurar RLS e políticas
const CONFIGURE_RLS_SQL = `
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
`;

// SQL para inserir dados de exemplo
const INSERT_SAMPLE_DATA_SQL = `
-- ========================================
-- DADOS DE EXEMPLO
-- ========================================

-- Inserir perfil admin de exemplo
INSERT INTO public.profiles (id, role, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'admin',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  updated_at = now();

-- Inserir algumas transações de exemplo
INSERT INTO public.transactions (customer_id, date, ggr, chargeback, deposit, withdrawal, natural_key)
VALUES 
  ('customer_001', '2024-01-01', 1000.00, 0.00, 500.00, 0.00, 'tx_001'),
  ('customer_002', '2024-01-02', 1500.00, 50.00, 750.00, 100.00, 'tx_002'),
  ('customer_003', '2024-01-03', 800.00, 0.00, 400.00, 0.00, 'tx_003')
ON CONFLICT (natural_key) DO NOTHING;

-- Inserir alguns pagamentos de exemplo
INSERT INTO public.payments (clientes_id, afiliados_id, date, value, method, status, classification, level, natural_key)
VALUES 
  ('customer_001', 'affiliate_001', '2024-01-01', 100.00, 'cpa', 'finish', 'Jogador', 1, 'pay_001'),
  ('customer_002', 'affiliate_001', '2024-01-02', 150.00, 'cpa', 'finish', 'Iniciante', 2, 'pay_002'),
  ('customer_003', 'affiliate_002', '2024-01-03', 80.00, 'cpa', 'finish', 'Jogador', 1, 'pay_003')
ON CONFLICT (natural_key) DO NOTHING;
`;

console.log('📋 Scripts SQL preparados para execução no Neon');
console.log('');

console.log('🔧 Para executar a migração:');
console.log('1. Acesse o console do Neon: https://console.neon.tech');
console.log('2. Vá para SQL Editor');
console.log('3. Execute os scripts na seguinte ordem:');
console.log('');

console.log('📝 SCRIPT 1 - Estrutura do Banco:');
console.log('='.repeat(40));
console.log(CREATE_STRUCTURE_SQL);
console.log('');

console.log('📝 SCRIPT 2 - Funções RPC:');
console.log('='.repeat(40));
console.log(CREATE_FUNCTIONS_SQL);
console.log('');

console.log('📝 SCRIPT 3 - RLS e Políticas:');
console.log('='.repeat(40));
console.log(CONFIGURE_RLS_SQL);
console.log('');

console.log('📝 SCRIPT 4 - Dados de Exemplo (Opcional):');
console.log('='.repeat(40));
console.log(INSERT_SAMPLE_DATA_SQL);
console.log('');

console.log('🎯 Após executar os scripts:');
console.log('1. Atualize a configuração do projeto para usar Neon');
console.log('2. Teste a conexão com o novo banco');
console.log('3. Verifique se a paginação está funcionando');

// Criar arquivos SQL separados
const fs = await import('fs');

fs.writeFileSync('neon-migration-1-structure.sql', CREATE_STRUCTURE_SQL);
fs.writeFileSync('neon-migration-2-functions.sql', CREATE_FUNCTIONS_SQL);
fs.writeFileSync('neon-migration-3-rls.sql', CONFIGURE_RLS_SQL);
fs.writeFileSync('neon-migration-4-sample-data.sql', INSERT_SAMPLE_DATA_SQL);

console.log('');
console.log('📁 Arquivos SQL criados:');
console.log('  - neon-migration-1-structure.sql');
console.log('  - neon-migration-2-functions.sql');
console.log('  - neon-migration-3-rls.sql');
console.log('  - neon-migration-4-sample-data.sql');
console.log('');
console.log('✅ Execute esses arquivos no SQL Editor do Neon na ordem indicada!');