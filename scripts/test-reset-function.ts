#!/usr/bin/env tsx

/**
 * Script para testar a função reset do banco de dados
 */

import { getNeonClient, closeNeonClient } from '../src/integrations/neon/client';

async function testResetFunction() {
  const client = await getNeonClient();

  try {
    console.log('🔌 Conectado ao banco Neon!\n');

    // 1. Verificar estado atual
    console.log('📊 ESTADO ATUAL DO BANCO:');
    console.log('='.repeat(50));
    
    const totalTx = await client.query('SELECT COUNT(*) as total FROM transactions');
    const totalPy = await client.query('SELECT COUNT(*) as total FROM payments');
    
    console.log(`Transações: ${totalTx.rows[0].total.toLocaleString()} linhas`);
    console.log(`Pagamentos: ${totalPy.rows[0].total.toLocaleString()} linhas`);
    console.log('');

    // 2. Simular operação de reset
    console.log('🧪 TESTANDO OPERAÇÃO DE RESET:');
    console.log('='.repeat(50));
    
    if (parseInt(totalTx.rows[0].total) > 0 || parseInt(totalPy.rows[0].total) > 0) {
      console.log('⚠️  ATENÇÃO: O banco contém dados!');
      console.log('   Esta operação irá APAGAR TODOS os dados.');
      console.log('   Confirme se você realmente quer fazer isso.');
      console.log('');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise<string>((resolve) => {
        rl.question('Deseja continuar e apagar todos os dados? (sim/nao): ', resolve);
      });
      
      rl.close();
      
      if (answer.toLowerCase() !== 'sim') {
        console.log('❌ Operação cancelada pelo usuário');
        return;
      }
      
      console.log('🔄 Executando TRUNCATE das tabelas...');
      
      // Executar TRUNCATE
      await client.query('TRUNCATE TABLE transactions RESTART IDENTITY');
      await client.query('TRUNCATE TABLE payments RESTART IDENTITY');
      
      console.log('✅ Tabelas truncadas com sucesso!');
      
      // 3. Verificar estado após reset
      console.log('\n📊 ESTADO APÓS RESET:');
      console.log('='.repeat(50));
      
      const totalTxAfter = await client.query('SELECT COUNT(*) as total FROM transactions');
      const totalPyAfter = await client.query('SELECT COUNT(*) as total FROM payments');
      
      console.log(`Transações: ${totalTxAfter.rows[0].total.toLocaleString()} linhas`);
      console.log(`Pagamentos: ${totalPyAfter.rows[0].total.toLocaleString()} linhas`);
      
      if (parseInt(totalTxAfter.rows[0].total) === 0 && parseInt(totalPyAfter.rows[0].total) === 0) {
        console.log('🎉 RESET REALIZADO COM SUCESSO!');
        console.log('   O banco está completamente limpo.');
      } else {
        console.log('⚠️  ALGO DEU ERRADO!');
        console.log('   Ainda há dados nas tabelas.');
      }
      
    } else {
      console.log('✅ O banco já está vazio!');
      console.log('   Não é necessário fazer reset.');
    }

  } catch (error) {
    console.error('💥 Erro durante o teste:', error);
  } finally {
    await closeNeonClient();
    console.log('\n🔌 Conexão encerrada');
  }
}

// Executar
testResetFunction().catch(console.error);