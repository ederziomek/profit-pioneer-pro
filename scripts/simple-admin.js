#!/usr/bin/env node

/**
 * Script simples para tornar ederziomek2@gmail.com como admin
 * 
 * Como usar:
 * 1. Copie este arquivo para o SQL Editor do Supabase Dashboard
 * 2. Execute o SQL
 * 
 * OU
 * 
 * 1. Configure a variável SUPABASE_SERVICE_ROLE_KEY
 * 2. Execute: node simple-admin.js
 */

const SUPABASE_URL = "https://fqmbtyccylsmbbahpmvw.supabase.co";

// SQL que pode ser executado diretamente no Supabase Dashboard
const ADMIN_SQL = `
-- Tornar ederziomek2@gmail.com como admin
-- Execute este SQL no Supabase Dashboard > SQL Editor

-- Verificar se o usuário existe
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'ederziomek2@gmail.com';

-- Tornar o usuário admin
INSERT INTO public.profiles (id, role, created_at, updated_at)
SELECT 
  id, 
  'admin'::public.app_role, 
  created_at, 
  now()
FROM auth.users 
WHERE email = 'ederziomek2@gmail.com'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin'::public.app_role,
  updated_at = now();

-- Verificar se foi bem-sucedido
SELECT 
  p.id,
  p.role,
  p.created_at,
  p.updated_at,
  u.email
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email = 'ederziomek2@gmail.com';
`;

// Instruções para execução
console.log('🚀 Script para tornar ederziomek2@gmail.com como admin');
console.log('');
console.log('📋 INSTRUÇÕES:');
console.log('');
console.log('1️⃣ Acesse: https://supabase.com/dashboard/project/fqmbtyccylsmbbahpmvw');
console.log('2️⃣ Vá para SQL Editor no menu lateral');
console.log('3️⃣ Clique em "New Query"');
console.log('4️⃣ Cole o SQL abaixo e clique em "Run"');
console.log('');
console.log('🔧 SQL PARA EXECUTAR:');
console.log('='.repeat(80));
console.log(ADMIN_SQL);
console.log('='.repeat(80));
console.log('');
console.log('✅ Após executar, o usuário ederziomek2@gmail.com será admin!');
console.log('🔄 Faça logout e login novamente para ver as mudanças');

// Se executado via Node.js com service role key
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('');
  console.log('🔑 Service Role Key detectada! Executando via Node.js...');
  
  import('@supabase/supabase-js').then(({ createClient }) => {
    const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Executar a operação
    makeUserAdmin(supabase);
  }).catch(console.error);
}

async function makeUserAdmin(supabase) {
  try {
    console.log('🔍 Procurando usuário...');
    
    // Atualizar perfil diretamente
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: null, // Será definido pela query
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('❌ Erro:', error);
      return;
    }

    console.log('✅ Usuário promovido a admin com sucesso!');
    console.log('📋 Dados:', data);
    
  } catch (error) {
    console.error('💥 Erro inesperado:', error);
  }
}