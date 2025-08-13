-- Script para tornar o usuário ederziomek2@gmail.com como admin
-- Execute este script no SQL Editor do Supabase Dashboard

-- Primeiro, vamos verificar se o usuário existe
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'ederziomek2@gmail.com';

-- Se o usuário existir, vamos atualizar ou inserir o perfil como admin
-- Nota: Esta operação requer privilégios de superusuário ou service role

-- Opção 1: Inserir novo perfil (se não existir)
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

-- Opção 2: Se preferir usar a função que criamos (requer que você seja admin)
-- CALL public.make_user_admin('ederziomek2@gmail.com');