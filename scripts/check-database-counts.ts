#!/usr/bin/env tsx

/**
 * Script para verificar contagens e dados das tabelas no banco Neon
 */

import { getNeonClient, closeNeonClient } from '../src/integrations/neon/client';

async function checkDatabaseCounts() {
  const client = await getNeonClient();

  try {
    console.log('🔌 Conectado ao banco Neon!\n');

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

    // 7. Verificar se há dados de teste ou amostra
    console.log('🧪 VERIFICANDO DADOS DE TESTE:');
    console.log('='.repeat(50));
    
    const sampleTx = await client.query(`
      SELECT customer_id, date, ggr, deposit, withdrawal
      FROM transactions 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    const samplePy = await client.query(`
      SELECT afiliados_id, clientes_id, date, value, method, status
      FROM payments 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log('Últimas 5 transações inseridas:');
    sampleTx.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. Customer: ${row.customer_id}, Data: ${row.date}, GGR: ${row.ggr}, Depósito: ${row.deposit}, Saque: ${row.withdrawal}`);
    });
    console.log('');
    
    console.log('Últimos 5 pagamentos inseridos:');
    samplePy.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. Afiliado: ${row.afiliados_id}, Cliente: ${row.clientes_id}, Data: ${row.date}, Valor: ${row.value}, Método: ${row.method}, Status: ${row.status}`);
    });
    console.log('');

    // 8. Verificar se há dados com datas futuras (possível problema de parsing)
    console.log('🔮 VERIFICANDO DATAS FUTURAS:');
    console.log('='.repeat(50));
    
    const futureDatesTx = await client.query(`
      SELECT COUNT(*) as total 
      FROM transactions 
      WHERE date > NOW()
    `);
    
    const futureDatesPy = await client.query(`
      SELECT COUNT(*) as total 
      FROM payments 
      WHERE date > NOW()
    `);
    
    console.log(`Transações com datas futuras: ${futureDatesTx.rows[0].total.toLocaleString()}`);
    console.log(`Pagamentos com datas futuras: ${futureDatesPy.rows[0].total.toLocaleString()}`);
    console.log('');

    // 9. Verificar se há dados com datas muito antigas
    console.log('📜 VERIFICANDO DATAS MUITO ANTIGAS:');
    console.log('='.repeat(50));
    
    const oldDatesTx = await client.query(`
      SELECT COUNT(*) as total 
      FROM transactions 
      WHERE date < '2020-01-01'
    `);
    
    const oldDatesPy = await client.query(`
      SELECT COUNT(*) as total 
      FROM payments 
      WHERE date < '2020-01-01'
    `);
    
    console.log(`Transações com datas antes de 2020: ${oldDatesTx.rows[0].total.toLocaleString()}`);
    console.log(`Pagamentos com datas antes de 2020: ${oldDatesPy.rows[0].total.toLocaleString()}`);
    console.log('');

    // 10. Resumo das discrepâncias
    console.log('📋 RESUMO DAS DISCREPÂNCIAS:');
    console.log('='.repeat(50));
    
    const expectedTx = 95156;
    const expectedPy = 99383;
    const actualTx = parseInt(totalTx.rows[0].total);
    const actualPy = parseInt(totalPy.rows[0].total);
    
    console.log(`Transações esperadas: ${expectedTx.toLocaleString()}`);
    console.log(`Transações no banco: ${actualTx.toLocaleString()}`);
    console.log(`Diferença: ${(actualTx - expectedTx).toLocaleString()} linhas`);
    console.log('');
    
    console.log(`Pagamentos esperados: ${expectedPy.toLocaleString()}`);
    console.log(`Pagamentos no banco: ${actualPy.toLocaleString()}`);
    console.log(`Diferença: ${(actualPy - expectedPy).toLocaleString()} linhas`);
    console.log('');

    if (actualTx < expectedTx) {
      console.log('⚠️  Transações: MUITO MENOS linhas no banco que na planilha');
      console.log('   Possíveis causas:');
      console.log('   - Dados foram limpos/resetados');
      console.log('   - Problema na importação (erro durante o processo)');
      console.log('   - Apenas dados de teste foram importados');
      console.log('   - Filtros muito restritivos rejeitaram a maioria das linhas');
    }
    
    if (actualPy < expectedPy) {
      console.log('⚠️  Pagamentos: MUITO MENOS linhas no banco que na planilha');
      console.log('   Possíveis causas:');
      console.log('   - Dados foram limpos/resetados');
      console.log('   - Problema na importação (erro durante o processo)');
      console.log('   - Apenas dados de teste foram importados');
      console.log('   - Filtros muito restritivos rejeitaram a maioria das linhas');
    }

    console.log('\n💡 RECOMENDAÇÕES:');
    console.log('='.repeat(50));
    console.log('1. Verifique se os dados foram limpos acidentalmente');
    console.log('2. Tente importar novamente as planilhas');
    console.log('3. Verifique os logs de importação para erros');
    console.log('4. Confirme se as planilhas têm o formato esperado');

  } catch (error) {
    console.error('💥 Erro ao consultar banco:', error);
  } finally {
    await closeNeonClient();
    console.log('🔌 Conexão encerrada');
  }
}

// Executar
checkDatabaseCounts().catch(console.error);