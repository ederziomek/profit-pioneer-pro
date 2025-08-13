# Configuração de Admin - Profit Pioneer Pro

Este documento explica como tornar o usuário `ederziomek2@gmail.com` como administrador no sistema.

## Método 1: Via Supabase Dashboard (Recomendado)

### Passo 1: Acessar o Supabase Dashboard
1. Vá para [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Faça login na sua conta
3. Selecione o projeto `profit-pioneer-pro` (ID: fqmbtyccylsmbbahpmvw)

### Passo 2: Executar o Script SQL
1. No menu lateral, clique em **SQL Editor**
2. Clique em **New Query**
3. Cole o seguinte código SQL:

```sql
-- Tornar ederziomek2@gmail.com como admin
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
```

4. Clique em **Run** para executar o script

### Passo 3: Verificar
- O script deve retornar os dados do usuário com `role = 'admin'`
- Se não retornar nada, significa que o usuário não existe ainda

## Método 2: Via Script Node.js

### Pré-requisitos
- Node.js instalado
- Chave de serviço (service role key) do Supabase

### Passo 1: Obter a Service Role Key
1. No Supabase Dashboard, vá para **Settings** > **API**
2. Copie a **service_role** key (não a anon key)

### Passo 2: Configurar a Variável de Ambiente
```bash
export SUPABASE_SERVICE_ROLE_KEY="sua_chave_aqui"
```

### Passo 3: Executar o Script
```bash
cd scripts
node make-admin.js
```

## Método 3: Via Aplicação Web

### Pré-requisitos
- Ter acesso a uma conta admin existente
- O usuário `ederziomek2@gmail.com` deve estar logado pelo menos uma vez

### Passo 1: Fazer Login como Admin
1. Use uma conta admin existente (ex: `admin@exemplo.com` com senha `senha123!`)
2. Ou use o botão "Preencher admin" na tela de login

### Passo 2: Executar a Função
1. No código, a função `make_user_admin` pode ser chamada
2. Esta função verifica se você é admin antes de executar

## Verificação

Para verificar se o usuário foi promovido a admin:

1. **Via SQL:**
```sql
SELECT 
  p.id,
  p.role,
  u.email
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email = 'ederziomek2@gmail.com';
```

2. **Via Aplicação:**
- Faça logout e login novamente com `ederziomek2@gmail.com`
- Verifique se as funcionalidades de admin estão disponíveis

## Estrutura do Banco

O sistema usa:
- **Tabela `profiles`**: Armazena o papel do usuário (`admin` ou `user`)
- **Função `is_admin()`**: Verifica se um usuário é admin
- **RLS (Row Level Security)**: Controla acesso baseado no papel

## Troubleshooting

### Erro: "User not found"
- O usuário precisa fazer login pelo menos uma vez para ser criado na tabela `auth.users`
- Verifique se o email está correto

### Erro: "Permission denied"
- Use a **service role key** em vez da **anon key**
- Ou execute via Supabase Dashboard com privilégios de superusuário

### Usuário não aparece como admin na aplicação
- Faça logout e login novamente
- Verifique se o cache foi limpo
- Confirme que a tabela `profiles` foi atualizada

## Arquivos Relacionados

- `supabase/migrations/20250813020000-make_user_admin.sql` - Função SQL para tornar usuário admin
- `scripts/make-admin.js` - Script Node.js para execução
- `scripts/make-admin.sql` - Script SQL para execução direta
- `src/context/AuthContext.tsx` - Lógica de autenticação
- `src/context/AnalyticsContext.tsx` - Verificações de admin