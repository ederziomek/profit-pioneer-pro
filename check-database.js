import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_SjN6yxOIKnc1@ep-green-surf-adprt5l3-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});

async function checkDatabase() {
  try {
    await client.connect();
    console.log('✅ Conectado ao Neon');

    // Verificar estrutura da tabela transactions
    console.log('🔍 Verificando tabela transactions...');
    const txResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'transactions' 
      ORDER BY ordinal_position
    `);
    
    console.log('📊 Colunas da tabela transactions:');
    txResult.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'}) ${col.column_default ? `default: ${col.column_default}` : ''}`);
    });

    // Verificar estrutura da tabela payments
    console.log('🔍 Verificando tabela payments...');
    const pyResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'payments' 
      ORDER BY ordinal_position
    `);
    
    console.log('📊 Colunas da tabela payments:');
    pyResult.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'}) ${col.column_default ? `default: ${col.column_default}` : ''}`);
    });

    // Verificar se a coluna updated_at existe
    console.log('🔍 Verificando coluna updated_at...');
    const hasUpdatedAtTx = txResult.rows.some(col => col.column_name === 'updated_at');
    const hasUpdatedAtPy = pyResult.rows.some(col => col.column_name === 'updated_at');
    
    console.log(`📊 Tabela transactions tem updated_at: ${hasUpdatedAtTx ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`📊 Tabela payments tem updated_at: ${hasUpdatedAtPy ? '✅ SIM' : '❌ NÃO'}`);

    // Adicionar coluna updated_at se não existir
    if (!hasUpdatedAtTx) {
      console.log('🔧 Adicionando coluna updated_at na tabela transactions...');
      await client.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
      console.log('✅ Coluna updated_at adicionada em transactions');
    }

    if (!hasUpdatedAtPy) {
      console.log('🔧 Adicionando coluna updated_at na tabela payments...');
      await client.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
      console.log('✅ Coluna updated_at adicionada em payments');
    }

    console.log('🎯 Verificação do banco concluída!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
    console.log('✅ Conexão fechada');
  }
}

checkDatabase();