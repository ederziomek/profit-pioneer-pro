#!/usr/bin/env node

/**
 * Script de migração do Supabase para Neon
 * 
 * Como usar:
 * 1. Configure as variáveis de ambiente:
 *    export SUPABASE_URL="sua_url_supabase"
 *    export SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key"
 *    export NEON_DATABASE_URL="sua_url_neon"
 * 
 * 2. Execute: node scripts/migrate-to-neon.js
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';

// Configuração
const SUPABASE_URL = process.env.SUPABASE_URL || "https://fqmbtyccylsmbbahpmvw.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY é obrigatória');
  console.log('📋 Obtenha em: https://supabase.com/dashboard/project/fqmbtyccylsmbbahpmvw/settings/api');
  process.exit(1);
}

if (!NEON_DATABASE_URL) {
  console.error('❌ NEON_DATABASE_URL é obrigatória');
  console.log('📋 Crie um projeto em: https://neon.tech');
  process.exit(1);
}

// Clientes
const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const neonClient = new Client({ connectionString: NEON_DATABASE_URL });

console.log('🚀 Iniciando migração do Supabase para Neon...\n');

async function migrateToNeon() {
  try {
    // 1. Conectar ao Neon
    console.log('🔌 Conectando ao Neon...');
    await neonClient.connect();
    console.log('✅ Conectado ao Neon\n');

    // 2. Criar estrutura do banco
    console.log('🏗️ Criando estrutura do banco...');
    await createDatabaseStructure();
    console.log('✅ Estrutura criada\n');

    // 3. Migrar dados existentes
    console.log('📊 Migrando dados existentes...');
    await migrateExistingData();
    console.log('✅ Dados migrados\n');

    // 4. Criar funções RPC
    console.log('⚙️ Criando funções RPC...');
    await createRPCFunctions();
    console.log('✅ Funções RPC criadas\n');

    // 5. Configurar RLS e políticas
    console.log('🔒 Configurando RLS e políticas...');
    await configureRLSAndPolicies();
    console.log('✅ RLS configurado\n');

    // 6. Atualizar configuração do projeto
    console.log('⚙️ Atualizando configuração do projeto...');
    await updateProjectConfiguration();
    console.log('✅ Configuração atualizada\n');

    console.log('🎉 Migração concluída com sucesso!');
    console.log('📋 Próximos passos:');
    console.log('1. Atualize as variáveis de ambiente no seu projeto');
    console.log('2. Teste a conexão com o novo banco');
    console.log('3. Verifique se todas as funcionalidades estão funcionando');

  } catch (error) {
    console.error('💥 Erro durante a migração:', error);
    process.exit(1);
  } finally {
    await neonClient.end();
  }
}

async function createDatabaseStructure() {
  const structureSQL = `
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

    -- 5. Índices
    CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date);
    CREATE INDEX IF NOT EXISTS idx_payments_afiliados_id ON public.payments(afiliados_id);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(date);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments(method);
  `;

  await neonClient.query(structureSQL);
}

async function migrateExistingData() {
  // Migrar dados do Supabase para Neon
  console.log('  📥 Migrando transações...');
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .order('id', { ascending: true });

  if (transactions && transactions.length > 0) {
    for (const tx of transactions) {
      await neonClient.query(`
        INSERT INTO public.transactions (customer_id, date, ggr, chargeback, deposit, withdrawal, natural_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (natural_key) DO NOTHING
      `, [tx.customer_id, tx.date, tx.ggr, tx.chargeback, tx.deposit, tx.withdrawal, tx.natural_key]);
    }
    console.log(`    ✅ ${transactions.length} transações migradas`);
  }

  console.log('  📥 Migrando pagamentos...');
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .order('id', { ascending: true });

  if (payments && payments.length > 0) {
    for (const payment of payments) {
      await neonClient.query(`
        INSERT INTO public.payments (clientes_id, afiliados_id, date, value, method, status, classification, level, natural_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (natural_key) DO NOTHING
      `, [payment.clientes_id, payment.afiliados_id, payment.date, payment.value, payment.method, payment.status, payment.classification, payment.level, payment.natural_key]);
    }
    console.log(`    ✅ ${payments.length} pagamentos migrados`);
  }

  console.log('  📥 Migrando perfis...');
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*');

  if (profiles && profiles.length > 0) {
    for (const profile of profiles) {
      await neonClient.query(`
        INSERT INTO public.profiles (id, role, created_at, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          role = EXCLUDED.role,
          updated_at = EXCLUDED.updated_at
      `, [profile.id, profile.role, profile.created_at, profile.updated_at]);
    }
    console.log(`    ✅ ${profiles.length} perfis migrados`);
  }
}

async function createRPCFunctions() {
  const functionsSQL = `
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

  await neonClient.query(functionsSQL);
}

async function configureRLSAndPolicies() {
  const rlsSQL = `
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

  await neonClient.query(rlsSQL);
}

async function updateProjectConfiguration() {
  // Criar arquivo de configuração do Neon
  const neonConfig = `
# Neon Database Configuration
# Substitua as variáveis abaixo no seu projeto

export NEON_DATABASE_URL="${NEON_DATABASE_URL}"

# Para desenvolvimento local
export NEON_HOST="${NEON_DATABASE_URL.split('@')[1]?.split('/')[0] || 'localhost'}"
export NEON_DATABASE="${NEON_DATABASE_URL.split('/').pop() || 'neondb'}"
export NEON_USER="${NEON_DATABASE_URL.split('://')[1]?.split(':')[0] || 'postgres'}"
export NEON_PASSWORD="${NEON_DATABASE_URL.split(':')[2]?.split('@')[0] || ''}"

# Configuração do Supabase (mantida para compatibilidade)
export SUPABASE_URL="${SUPABASE_URL}"
export SUPABASE_ANON_KEY="sua_chave_anon_aqui"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
  `;

  // Criar arquivo de configuração
  const fs = await import('fs');
  fs.writeFileSync('.env.neon', neonConfig);
  
  console.log('  📝 Arquivo .env.neon criado com as configurações');
}

// Executar migração
migrateToNeon().catch(console.error);