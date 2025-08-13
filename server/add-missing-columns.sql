-- Script para adicionar colunas faltantes ao banco de dados
-- Execute este script no seu banco Neon para incluir todas as informações das planilhas

-- Adicionar colunas faltantes na tabela transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS user_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS qtde_deposito INTEGER DEFAULT 1;

-- Adicionar colunas faltantes na tabela payments  
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS id_transaction VARCHAR(255);

-- Comentários das colunas para documentação
COMMENT ON COLUMN transactions.user_id IS 'ID do usuário da planilha';
COMMENT ON COLUMN transactions.qtde_deposito IS 'Quantidade de depósitos';
COMMENT ON COLUMN payments.id_transaction IS 'ID da transação da planilha';

-- Verificar estrutura atualizada
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('transactions', 'payments')
ORDER BY table_name, ordinal_position;