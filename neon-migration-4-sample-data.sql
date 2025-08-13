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
