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

// Função para processar arquivo de transações
const parseTransactionsFile = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  const rows = data.slice(1);
  
  return rows
    .filter((row) => row[0] && row[1])
    .map((row) => ({
      customer_id: String(row[0]),
      date: new Date(row[1]),
      ggr: Number(row[2]) || 0,
      chargeback: Number(row[3]) || 0,
      deposit: Number(row[4]) || 0,
      withdrawal: Number(row[5]) || 0,
    }))
    .filter((t) => t.customer_id && !isNaN(t.date.getTime()));
};

// Função para processar arquivo de pagamentos
const parsePaymentsFile = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  const rows = data.slice(1);
  
  return rows
    .filter((row) => row[0] && row[1])
    .map((row) => ({
      clientes_id: row[0] ? String(row[0]) : null,
      afiliados_id: String(row[1]),
      date: new Date(row[2]),
      value: Number(row[3]) || 0,
      method: String(row[4]) || 'cpa',
      status: String(row[5]) || 'finish',
      classification: String(row[6]) || 'normal',
      level: Number(row[7]) || 1,
    }))
    .filter((p) => !!p.afiliados_id && !isNaN(p.date.getTime()));
};

// Rota para importar transações
app.post('/api/import/transactions', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const transactions = parseTransactionsFile(req.file.buffer);
    
    if (transactions.length === 0) {
      return res.status(400).json({ error: 'Nenhuma transação válida encontrada no arquivo' });
    }

    const client = await getNeonClient();
    
    // Inserir transações com ON CONFLICT
    const result = await client.query(`
      INSERT INTO transactions (customer_id, date, ggr, chargeback, deposit, withdrawal, natural_key)
      VALUES ${transactions.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6}, $${i * 6 + 7})`).join(', ')}
      ON CONFLICT (natural_key) DO UPDATE SET
        ggr = EXCLUDED.ggr,
        chargeback = EXCLUDED.chargeback,
        deposit = EXCLUDED.deposit,
        withdrawal = EXCLUDED.withdrawal,
        updated_at = NOW()
    `, transactions.flatMap(t => [
      t.customer_id, t.date, t.ggr, t.chargeback, t.deposit, t.withdrawal,
      `${t.customer_id}_${t.date.toISOString().split('T')[0]}`
    ]));

    res.json({ 
      message: `${transactions.length} transações importadas com sucesso`,
      count: transactions.length
    });
  } catch (error) {
    console.error('Erro ao importar transações:', error);
    res.status(500).json({ error: 'Erro ao importar transações: ' + error.message });
  }
});

// Rota para importar pagamentos
app.post('/api/import/payments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const payments = parsePaymentsFile(req.file.buffer);
    
    if (payments.length === 0) {
      return res.status(400).json({ error: 'Nenhum pagamento válido encontrado no arquivo' });
    }

    const client = await getNeonClient();
    
    // Inserir pagamentos com ON CONFLICT
    const result = await client.query(`
      INSERT INTO payments (clientes_id, afiliados_id, date, value, method, status, classification, level, natural_key)
      VALUES ${payments.map((_, i) => `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`).join(', ')}
      ON CONFLICT (natural_key) DO UPDATE SET
        value = EXCLUDED.value,
        method = EXCLUDED.method,
        status = EXCLUDED.status,
        classification = EXCLUDED.classification,
        level = EXCLUDED.level,
        updated_at = NOW()
    `, payments.flatMap(p => [
      p.clientes_id, p.afiliados_id, p.date, p.value, p.method, p.status, p.classification, p.level,
      `${p.afiliados_id}_${p.date.toISOString().split('T')[0]}_${p.method}`
    ]));

    res.json({ 
      message: `${payments.length} pagamentos importados com sucesso`,
      count: payments.length
    });
  } catch (error) {
    console.error('Erro ao importar pagamentos:', error);
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
  console.log('🚀 SERVIDOR EXPRESS CORRIGIDO INICIADO!');
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