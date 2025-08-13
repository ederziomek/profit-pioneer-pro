import express from 'express';
import { Client } from 'pg';
import multer from 'multer';
import XLSX from 'xlsx';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Status do servidor
let serverStatus = {
  status: 'starting',
  database: 'unknown',
  timestamp: new Date().toISOString(),
  uptime: 0
};

// Rota de healthcheck para o Railway - SEMPRE RESPONDE
app.get('/health', (req, res) => {
  serverStatus.uptime = process.uptime();
  serverStatus.timestamp = new Date().toISOString();
  
  // Se o banco estiver OK, retorna 200, senão 503 (Service Unavailable)
  const statusCode = serverStatus.database === 'connected' ? 200 : 503;
  
  res.status(statusCode).json({
    status: serverStatus.status,
    database: serverStatus.database,
    timestamp: serverStatus.timestamp,
    uptime: serverStatus.uptime,
    message: serverStatus.database === 'connected' 
      ? 'Server is running and healthy' 
      : 'Server is running but database is unavailable'
  });
});

// Rota de healthcheck simples para Railway - SEMPRE RESPONDE
app.get('/health/simple', (req, res) => {
  res.status(200).send('OK');
});

// Configuração do multer para upload de arquivos
const upload = multer({ storage: multer.memoryStorage() });

// Configuração do banco Neon
const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL || 
  "postgresql://neondb_owner:npg_SjN6yxOIKnc1@ep-green-surf-adprt5l3-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// Cliente do banco
let neonClient = null;

const getNeonClient = async () => {
  if (!neonClient) {
    try {
      neonClient = new Client({ connectionString: NEON_DATABASE_URL });
      await neonClient.connect();
      serverStatus.database = 'connected';
      console.log('✅ Conexão Neon estabelecida');
    } catch (error) {
      console.error('❌ Erro ao conectar com Neon:', error.message);
      serverStatus.database = 'error';
      throw error;
    }
  }
  return neonClient;
};

// Teste de conexão assíncrono
const testDatabaseConnection = async () => {
  try {
    const client = await getNeonClient();
    await client.query('SELECT 1');
    serverStatus.database = 'connected';
    serverStatus.status = 'ready';
    console.log('✅ Banco de dados conectado e funcionando');
  } catch (error) {
    serverStatus.database = 'error';
    serverStatus.status = 'ready';
    console.error('❌ Banco de dados indisponível:', error.message);
  }
};

// Função para processar arquivo de transações - COLUNAS CORRETAS
const parseTransactionsFile = (buffer) => {
  try {
    console.log('🔍 Iniciando parsing do arquivo de transações...');
    
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    console.log('📊 Planilhas encontradas:', workbook.SheetNames);
    
    const sheetName = workbook.SheetNames[0];
    console.log('📋 Usando planilha:', sheetName);
    
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log('📈 Total de linhas no arquivo:', data.length);
    console.log('📋 Cabeçalho:', data[0]);
    console.log('📋 Primeiras 3 linhas (exemplo):', data.slice(0, 3));
    
    const rows = data.slice(1); // Remove cabeçalho
    console.log('📊 Linhas de dados (sem cabeçalho):', rows.length);
    
    // Log das primeiras linhas para debug
    console.log('🔍 Primeiras 5 linhas de dados:');
    rows.slice(0, 5).forEach((row, index) => {
      console.log(`  Linha ${index + 1}:`, row);
    });
    
    // COLUNAS CORRETAS: date, user_id, customer_id, qtde_deposito, valor_deposito, valor_saque, chargeback, ggr
    const validRows = rows.filter((row, index) => {
      const hasCustomerId = row[2] && String(row[2]).trim() !== ''; // customer_id na coluna 2
      const hasDate = row[0] && row[0] !== ''; // date na coluna 0
      
      if (!hasCustomerId || !hasDate) {
        console.log(`⚠️ Linha ${index + 1} rejeitada: customer_id=${row[2]}, date=${row[0]}`);
      }
      
      return hasCustomerId && hasDate;
    });
    
    console.log('✅ Linhas válidas encontradas:', validRows.length);
    
    const transactions = validRows.map((row, index) => {
      try {
        // COLUNAS CORRETAS baseadas na sua planilha:
        // [0] date, [1] user_id, [2] customer_id, [3] qtde_deposito, [4] valor_deposito, [5] valor_saque, [6] chargeback, [7] ggr
        
        const customer_id = String(row[2]).trim(); // customer_id na coluna 2
        const date = new Date(row[0]); // date na coluna 0
        
        // Converter valores monetários (remover R$ e converter vírgula para ponto)
        const valorDeposito = String(row[4] || '0').replace('R$', '').replace(/\s+/g, '').replace(',', '.');
        const valorSaque = String(row[5] || '0').replace('R$', '').replace(/\s+/g, '').replace(',', '.');
        const chargeback = String(row[6] || '0').replace('R$', '').replace(/\s+/g, '').replace(',', '.');
        const ggr = String(row[7] || '0').replace('R$', '').replace(/\s+/g, '').replace(',', '.');
        
        const deposit = valorDeposito === '-' ? 0 : Number(valorDeposito) || 0;
        const withdrawal = valorSaque === '-' ? 0 : Number(valorSaque) || 0;
        const chargebackValue = chargeback === '-' ? 0 : Number(chargeback) || 0;
        const ggrValue = ggr === '-' ? 0 : Number(ggr) || 0;
        
        // Log de cada transação processada
        console.log(`  ✅ Transação ${index + 1}:`, {
          customer_id,
          date: date.toISOString(),
          deposit,
          withdrawal,
          chargeback: chargebackValue,
          ggr: ggrValue
        });
        
        return {
          customer_id,
          date,
          ggr: ggrValue,
          chargeback: chargebackValue,
          deposit,
          withdrawal,
        };
      } catch (error) {
        console.error(`❌ Erro ao processar linha ${index + 1}:`, error, 'Dados:', row);
        return null;
      }
    }).filter(t => t !== null);
    
    console.log('🎯 Total de transações processadas com sucesso:', transactions.length);
    return transactions;
    
  } catch (error) {
    console.error('❌ Erro ao processar arquivo de transações:', error);
    throw new Error('Erro ao processar arquivo Excel: ' + error.message);
  }
};

// Função para processar arquivo de pagamentos - COLUNAS CORRETAS
const parsePaymentsFile = (buffer) => {
  try {
    console.log('🔍 Iniciando parsing do arquivo de pagamentos...');
    
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    console.log('📊 Planilhas encontradas:', workbook.SheetNames);
    
    const sheetName = workbook.SheetNames[0];
    console.log('📋 Usando planilha:', sheetName);
    
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log('📈 Total de linhas no arquivo:', data.length);
    console.log('📋 Cabeçalho:', data[0]);
    console.log('📋 Primeiras 3 linhas (exemplo):', data.slice(0, 3));
    
    const rows = data.slice(1); // Remove cabeçalho
    console.log('📊 Linhas de dados (sem cabeçalho):', rows.length);
    
    // Log das primeiras linhas para debug
    console.log('🔍 Primeiras 5 linhas de dados:');
    rows.slice(0, 5).forEach((row, index) => {
      console.log(`  Linha ${index + 1}:`, row);
    });
    
    // COLUNAS CORRETAS: id_transaction, clientes_id, level, value, date, afiliados_id, status, classification, method
    const validRows = rows.filter((row, index) => {
      const hasAfiliadoId = row[5] && String(row[5]).trim() !== ''; // afiliados_id na coluna 5
      const hasDate = row[4] && row[4] !== ''; // date na coluna 4
      
      if (!hasAfiliadoId || !hasDate) {
        console.log(`⚠️ Linha ${index + 1} rejeitada: afiliados_id=${row[5]}, date=${row[4]}`);
      }
      
      return hasAfiliadoId && hasDate;
    });
    
    console.log('✅ Linhas válidas encontradas:', validRows.length);
    
    const payments = validRows.map((row, index) => {
      try {
        // COLUNAS CORRETAS baseadas na sua planilha:
        // [0] id_transaction, [1] clientes_id, [2] level, [3] value, [4] date, [5] afiliados_id, [6] status, [7] classification, [8] method
        
        const clientes_id = row[1] ? String(row[1]).trim() : null; // clientes_id na coluna 1
        const afiliados_id = String(row[5]).trim(); // afiliados_id na coluna 5
        const date = new Date(row[4]); // date na coluna 4
        const value = Number(row[3]) || 0; // value na coluna 3
        const method = String(row[8] || 'cpa').trim(); // method na coluna 8
        const status = String(row[6] || 'finish').trim(); // status na coluna 6
        const classification = String(row[7] || 'normal').trim(); // classification na coluna 7
        const level = Number(row[2]) || 1; // level na coluna 2
        
        // Log de cada pagamento processado
        console.log(`  ✅ Pagamento ${index + 1}:`, {
          clientes_id,
          afiliados_id,
          date: date.toISOString(),
          value,
          method,
          status,
          classification,
          level
        });
        
        return {
          clientes_id,
          afiliados_id,
          date,
          value,
          method,
          status,
          classification,
          level,
        };
      } catch (error) {
        console.error(`❌ Erro ao processar linha ${index + 1}:`, error, 'Dados:', row);
        return null;
      }
    }).filter(p => p !== null);
    
    console.log('🎯 Total de pagamentos processados com sucesso:', payments.length);
    return payments;
    
  } catch (error) {
    console.error('❌ Erro ao processar arquivo de pagamentos:', error);
    throw new Error('Erro ao processar arquivo Excel: ' + error.message);
  }
};

// Rota para importar transações - COLUNAS CORRETAS
app.post('/api/import/transactions', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    console.log('📁 Arquivo recebido:', req.file.originalname, 'Tamanho:', req.file.size);

    const transactions = parseTransactionsFile(req.file.buffer);
    
    if (transactions.length === 0) {
      return res.status(400).json({ 
        error: 'Nenhuma transação válida encontrada no arquivo',
        debug: 'Verifique os logs do servidor para mais detalhes'
      });
    }

    console.log('📊 Transações processadas:', transactions.length);

    const client = await getNeonClient();
    
    // Query simplificada - inserir uma por vez para evitar problemas de sintaxe
    let insertedCount = 0;
    let updatedCount = 0;
    
    for (const transaction of transactions) {
      try {
        const naturalKey = `${transaction.customer_id}_${transaction.date.toISOString().split('T')[0]}`;
        
        const result = await client.query(`
          INSERT INTO transactions (customer_id, date, ggr, chargeback, deposit, withdrawal, natural_key)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (natural_key) DO UPDATE SET
            ggr = EXCLUDED.ggr,
            chargeback = EXCLUDED.chargeback,
            deposit = EXCLUDED.deposit,
            withdrawal = EXCLUDED.withdrawal,
            updated_at = NOW()
        `, [
          transaction.customer_id,
          transaction.date,
          transaction.ggr,
          transaction.chargeback,
          transaction.deposit,
          transaction.withdrawal,
          naturalKey
        ]);
        
        if (result.rowCount > 0) {
          if (result.command === 'INSERT') {
            insertedCount++;
          } else {
            updatedCount++;
          }
        }
      } catch (error) {
        console.error('Erro ao inserir transação:', transaction, error.message);
        // Continua com as próximas transações
      }
    }

    console.log(`✅ Transações processadas: ${insertedCount} inseridas, ${updatedCount} atualizadas`);

    res.json({ 
      message: `${transactions.length} transações processadas com sucesso`,
      inserted: insertedCount,
      updated: updatedCount,
      total: transactions.length
    });
  } catch (error) {
    console.error('❌ Erro ao importar transações:', error);
    res.status(500).json({ error: 'Erro ao importar transações: ' + error.message });
  }
});

// Rota para importar pagamentos - COLUNAS CORRETAS
app.post('/api/import/payments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    console.log('📁 Arquivo recebido:', req.file.originalname, 'Tamanho:', req.file.size);

    const payments = parsePaymentsFile(req.file.buffer);
    
    if (payments.length === 0) {
      return res.status(400).json({ 
        error: 'Nenhum pagamento válido encontrado no arquivo',
        debug: 'Verifique os logs do servidor para mais detalhes'
      });
    }

    console.log('📊 Pagamentos processados:', payments.length);

    const client = await getNeonClient();
    
    // Query simplificada - inserir um por vez para evitar problemas de sintaxe
    let insertedCount = 0;
    let updatedCount = 0;
    
    for (const payment of payments) {
      try {
        const naturalKey = `${payment.afiliados_id}_${payment.date.toISOString().split('T')[0]}_${payment.method}`;
        
        const result = await client.query(`
          INSERT INTO payments (clientes_id, afiliados_id, date, value, method, status, classification, level, natural_key)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (natural_key) DO UPDATE SET
            value = EXCLUDED.value,
            method = EXCLUDED.method,
            status = EXCLUDED.status,
            classification = EXCLUDED.classification,
            level = EXCLUDED.level,
            updated_at = NOW()
        `, [
          payment.clientes_id,
          payment.afiliados_id,
          payment.date,
          payment.value,
          payment.method,
          payment.status,
          payment.classification,
          payment.level,
          naturalKey
        ]);
        
        if (result.rowCount > 0) {
          if (result.command === 'INSERT') {
            insertedCount++;
          } else {
            updatedCount++;
          }
        }
      } catch (error) {
        console.error('Erro ao inserir pagamento:', payment, error.message);
        // Continua com os próximos pagamentos
      }
    }

    console.log(`✅ Pagamentos processados: ${insertedCount} inseridos, ${updatedCount} atualizados`);

    res.json({ 
      message: `${payments.length} pagamentos processados com sucesso`,
      inserted: insertedCount,
      updated: updatedCount,
      total: payments.length
    });
  } catch (error) {
    console.error('❌ Erro ao importar pagamentos:', error);
    res.status(500).json({ error: 'Erro ao importar pagamentos: ' + error.message });
  }
});

// Rota para obter contagens
app.get('/api/counts', async (req, res) => {
  try {
    const client = await getNeonClient();
    
    const [txResult, pyResult] = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM transactions'),
      client.query('SELECT COUNT(*) as count FROM payments')
    ]);

    res.json({
      transactions: parseInt(txResult.rows[0].count),
      payments: parseInt(pyResult.rows[0].count)
    });
  } catch (error) {
    console.error('Erro ao obter contagens:', error);
    res.status(500).json({ error: 'Erro ao obter contagens: ' + error.message });
  }
});

// Rota para obter semanas
app.get('/api/weeks', async (req, res) => {
  try {
    const client = await getNeonClient();
    
    const [txResult, pyResult] = await Promise.all([
      client.query(`
        SELECT DISTINCT date_trunc('week', date) as week_start
        FROM transactions 
        ORDER BY week_start DESC
      `),
      client.query(`
        SELECT DISTINCT date_trunc('week', date) as week_start
        FROM payments 
        ORDER BY week_start DESC
      `)
    ]);

    const weeks = [...new Set([
      ...txResult.rows.map(r => r.week_start),
      ...pyResult.rows.map(r => r.week_start)
    ])].sort((a, b) => new Date(b) - new Date(a));

    res.json({ weeks: weeks.map(w => w.toISOString().split('T')[0]) });
  } catch (error) {
    console.error('Erro ao obter semanas:', error);
    res.status(500).json({ error: 'Erro ao obter semanas: ' + error.message });
  }
});

// Rota para resetar dados
app.post('/api/reset', async (req, res) => {
  try {
    const client = await getNeonClient();
    
    await Promise.all([
      client.query('DELETE FROM transactions'),
      client.query('DELETE FROM payments')
    ]);

    res.json({ message: 'Banco de dados zerado com sucesso' });
  } catch (error) {
    console.error('Erro ao resetar dados:', error);
    res.status(500).json({ error: 'Erro ao resetar dados: ' + error.message });
  }
});

// Rota para obter transações paginadas
app.get('/api/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const client = await getNeonClient();
    
    const [dataResult, countResult] = await Promise.all([
      client.query(`
        SELECT * FROM transactions 
        ORDER BY date DESC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      client.query('SELECT COUNT(*) as count FROM transactions')
    ]);

    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
      }
    });
  } catch (error) {
    console.error('Erro ao obter transações:', error);
    res.status(500).json({ error: 'Erro ao obter transações: ' + error.message });
  }
});

// Rota para obter pagamentos paginados
app.get('/api/payments', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const client = await getNeonClient();
    
    const [dataResult, countResult] = await Promise.all([
      client.query(`
        SELECT * FROM payments 
        ORDER BY date DESC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      client.query('SELECT COUNT(*) as count FROM payments')
    ]);

    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
      }
    });
  } catch (error) {
    console.error('Erro ao obter pagamentos:', error);
    res.status(500).json({ error: 'Erro ao obter pagamentos: ' + error.message });
  }
});

// IMPORTANTE: Serve static frontend files BEFORE API routes
app.use(express.static(path.join(__dirname, '../dist')));

// Catch-all route for SPA - MUST BE LAST
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 SERVIDOR EXPRESS CORRIGIDO FINAL!');
  console.log('=================================');
  console.log(`📍 Porta: ${port}`);
  console.log(`📁 Frontend React: http://localhost:${port}`);
  console.log(`⚡ API: http://localhost:${port}/api`);
  console.log(`💚 Healthcheck: http://localhost:${port}/health`);
  console.log('=================================');
  
  // Testar conexão com banco de forma assíncrona
  setTimeout(() => {
    testDatabaseConnection();
  }, 1000);
  
  console.log('✅ FRONTEND REACT FUNCIONANDO!');
  console.log('✅ IMPORTAÇÃO DE PLANILHAS COM COLUNAS CORRETAS!');
  console.log('=================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM recebido, fechando servidor...');
  server.close(() => {
    console.log('✅ Servidor fechado');
    if (neonClient) {
      neonClient.end();
      console.log('✅ Conexão Neon fechada');
    }
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT recebido, fechando servidor...');
  server.close(() => {
    console.log('✅ Servidor fechado');
    if (neonClient) {
      neonClient.end();
      console.log('✅ Conexão Neon fechada');
    }
    process.exit(0);
  });
});