#!/usr/bin/env node

/**
 * Script para verificar contagens e dados das tabelas no banco Neon
 */

const { Client } = require('pg');

const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL;

if (!NEON_DATABASE_URL) {
  console.error('❌ NEON_DATABASE_URL é obrigatório');
  console.log('Configure a variável de ambiente:');
  console.log('export NEON_DATABASE_URL="sua_string_de_conexao"');
  process.exit(1);
}

async function checkDatabaseCounts() {
  const client = new Client({
    connectionString: NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Conectando ao banco Neon...');
    await client.connect();
    console.log('✅ Conectado com sucesso!\n');

    // 1. Contagem total de linhas
    console.log('📊 CONTAGEM TOTAL DE LINHAS:');
    console.log('='.repeat(50));
    
    const totalTx = await client.query('SELECT COUNT(*) as total FROM transactions');
    const totalPy = await client.query('SELECT COUNT(*) as total FROM payments');
    
    console.log(`Transações: ${totalTx.rows[0].total.toLocaleString()} linhas`);
    console.log(`Pagamentos: ${totalPy.rows[0].total.toLocaleString()} linhas`);
    console.log('');

    // 2. Verificar linhas com customer_id vazio ou nulo (transactions)
    console.log('🔍 VERIFICANDO LINHAS COM DADOS VAZIOS:');
    console.log('='.repeat(50));
    
    const emptyCustomerId = await client.query(`
      SELECT COUNT(*) as total 
      FROM transactions 
      WHERE customer_id IS NULL OR customer_id = '' OR customer_id = 'null'
    `);
    
    const emptyDateTx = await client.query(`
      SELECT COUNT(*) as total 
      FROM transactions 
      WHERE date IS NULL
    `);
    
    console.log(`Transações com customer_id vazio/nulo: ${emptyCustomerId.rows[0].total.toLocaleString()}`);
    console.log(`Transações com data nula: ${emptyDateTx.rows[0].total.toLocaleString()}`);
    console.log('');

    // 3. Verificar linhas com afiliados_id vazio ou nulo (payments)
    const emptyAfiliadosId = await client.query(`
      SELECT COUNT(*) as total 
      FROM payments 
      WHERE afiliados_id IS NULL OR afiliados_id = '' OR afiliados_id = 'null'
    `);
    
    const emptyDatePy = await client.query(`
      SELECT COUNT(*) as total 
      FROM payments 
      WHERE date IS NULL
    `);
    
    console.log(`Pagamentos com afiliados_id vazio/nulo: ${emptyAfiliadosId.rows[0].total.toLocaleString()}`);
    console.log(`Pagamentos com data nula: ${emptyDatePy.rows[0].total.toLocaleString()}`);
    console.log('');

    // 4. Verificar linhas duplicadas
    console.log('🔄 VERIFICANDO POSSÍVEIS DUPLICATAS:');
    console.log('='.repeat(50));
    
    const duplicateTx = await client.query(`
      SELECT COUNT(*) as total 
      FROM (
        SELECT customer_id, date, COUNT(*) as cnt
        FROM transactions 
        GROUP BY customer_id, date
        HAVING COUNT(*) > 1
      ) as dups
    `);
    
    const duplicatePy = await client.query(`
      SELECT COUNT(*) as total 
      FROM (
        SELECT afiliados_id, clientes_id, date, method, value, COUNT(*) as cnt
        FROM payments 
        GROUP BY afiliados_id, clientes_id, date, method, value
        HAVING COUNT(*) > 1
      ) as dups
    `);
    
    console.log(`Transações duplicadas (mesmo customer_id + data): ${duplicateTx.rows[0].total.toLocaleString()}`);
    console.log(`Pagamentos duplicados (mesma chave): ${duplicatePy.rows[0].total.toLocaleString()}`);
    console.log('');

    // 5. Verificar distribuição por data
    console.log('📅 DISTRIBUIÇÃO POR DATA:');
    console.log('='.repeat(50));
    
    const dateRangeTx = await client.query(`
      SELECT 
        MIN(date) as min_date,
        MAX(date) as max_date,
        COUNT(DISTINCT date) as unique_dates
      FROM transactions
    `);
    
    const dateRangePy = await client.query(`
      SELECT 
        MIN(date) as min_date,
        MAX(date) as max_date,
        COUNT(DISTINCT date) as unique_dates
      FROM payments
    `);
    
    console.log('Transações:');
    console.log(`  Data mais antiga: ${dateRangeTx.rows[0].min_date}`);
    console.log(`  Data mais recente: ${dateRangeTx.rows[0].max_date}`);
    console.log(`  Datas únicas: ${dateRangeTx.rows[0].unique_dates.toLocaleString()}`);
    console.log('');
    
    console.log('Pagamentos:');
    console.log(`  Data mais antiga: ${dateRangePy.rows[0].min_date}`);
    console.log(`  Data mais recente: ${dateRangePy.rows[0].max_date}`);
    console.log(`  Datas únicas: ${dateRangePy.rows[0].unique_dates.toLocaleString()}`);
    console.log('');

    // 6. Verificar valores extremos
    console.log('💰 VERIFICANDO VALORES EXTREMOS:');
    console.log('='.repeat(50));
    
    const extremeTx = await client.query(`
      SELECT 
        COUNT(*) as total_zero_ggr,
        COUNT(*) FILTER (WHERE ggr = 0) as zero_ggr,
        COUNT(*) FILTER (WHERE deposit = 0 AND withdrawal = 0) as zero_values
      FROM transactions
    `);
    
    const extremePy = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE value = 0) as zero_value,
        COUNT(*) FILTER (WHERE value < 0) as negative_value
      FROM payments
    `);
    
    console.log(`Transações com GGR = 0: ${extremeTx.rows[0].zero_ggr.toLocaleString()}`);
    console.log(`Transações com depósito e saque = 0: ${extremeTx.rows[0].zero_values.toLocaleString()}`);
    console.log(`Pagamentos com valor = 0: ${extremePy.rows[0].zero_value.toLocaleString()}`);
    console.log(`Pagamentos com valor negativo: ${extremePy.rows[0].negative_value.toLocaleString()}`);
    console.log('');

    // 7. Resumo das discrepâncias
    console.log('📋 RESUMO DAS DISCREPÂNCIAS:');
    console.log('='.repeat(50));
    
    const expectedTx = 95156;
    const expectedPy = 99383;
    const actualTx = parseInt(totalTx.rows[0].total);
    const actualPy = parseInt(totalPy.rows[0].total);
    
    console.log(`Transações esperadas: ${expectedTx.toLocaleString()}`);
    console.log(`Transações no banco: ${actualTx.toLocaleString()}`);
    console.log(`Diferença: +${(actualTx - expectedTx).toLocaleString()} linhas`);
    console.log('');
    
    console.log(`Pagamentos esperados: ${expectedPy.toLocaleString()}`);
    console.log(`Pagamentos no banco: ${actualPy.toLocaleString()}`);
    console.log(`Diferença: -${(expectedPy - actualPy).toLocaleString()} linhas`);
    console.log('');

    if (actualTx > expectedTx) {
      console.log('⚠️  Transações: Mais linhas no banco que na planilha');
      console.log('   Possíveis causas:');
      console.log('   - Importações duplicadas');
      console.log('   - Dados residuais de importações anteriores');
      console.log('   - Linhas com dados válidos que passaram pelos filtros');
    }
    
    if (actualPy < expectedPy) {
      console.log('⚠️  Pagamentos: Menos linhas no banco que na planilha');
      console.log('   Possíveis causas:');
      console.log('   - Linhas com afiliados_id vazio/nulo');
      console.log('   - Linhas com datas inválidas');
      console.log('   - Linhas com valores obrigatórios ausentes');
    }

  } catch (error) {
    console.error('💥 Erro ao consultar banco:', error.message);
  } finally {
    await client.end();
    console.log('🔌 Conexão encerrada');
  }
}

// Executar
checkDatabaseCounts().catch(console.error);