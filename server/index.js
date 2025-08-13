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
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(express.json());

// Log de requests em desenvolvimento
if (!isProduction) {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Rota de healthcheck para o Railway
app.get('/health', (req, res) => {
  try {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      port: port,
      message: 'Server is running and healthy'
    });
  } catch (error) {
    console.error('Erro no healthcheck:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      timestamp: new Date().toISOString()
    });
  }
});

// Rota raiz simples para compatibilidade
app.get('/', (req, res) => {
  res.json({ 
    message: 'Profit Pioneer Pro API',
    status: 'running',
    timestamp: new Date().toISOString()
  });
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
    neonClient = new Client({ connectionString: NEON_DATABASE_URL });
    await neonClient.connect();
  }
  return neonClient;
};

// Função para processar arquivo de transações
const parseTransactionsFile = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  // Pular cabeçalho
  const rows = data.slice(1);
  
  return rows
    .filter((row) => row[0] && row[1]) // customer_id e date
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
  
  // Pular cabeçalho
  const rows = data.slice(1);
  
  return rows
    .filter((row) => row[0] && row[1]) // afiliados_id e date
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

    const rows = parseTransactionsFile(req.file.buffer);
    
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Nenhuma transação válida encontrada' });
    }

    const client = await getNeonClient();
    
    // Preparar dados para inserção
    const payload = rows.map((r) => ({
      natural_key: `${r.customer_id}|${r.date.toISOString().split('T')[0]}`,
      customer_id: r.customer_id,
      date: r.date.toISOString(),
      ggr: r.ggr,
      chargeback: r.chargeback,
      deposit: r.deposit,
      withdrawal: r.withdrawal,
    }));

    // Deduplicar por natural_key
    const byKey = new Map();
    for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
    const records = Array.from(byKey.values());

    // Inserir em lotes
    const CHUNK = 1000;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      
      const values = chunk.map((_, index) => {
        const baseIndex = index * 6;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`;
      }).join(', ');
      
      const params = chunk.flatMap(record => [
        record.natural_key, record.customer_id, record.date, 
        record.ggr, record.chargeback, record.deposit, record.withdrawal
      ]);
      
      const query = `
        INSERT INTO transactions (natural_key, customer_id, date, ggr, chargeback, deposit, withdrawal)
        VALUES ${values}
        ON CONFLICT (natural_key) DO UPDATE SET
          customer_id = EXCLUDED.customer_id,
          date = EXCLUDED.date,
          ggr = EXCLUDED.ggr,
          chargeback = EXCLUDED.chargeback,
          deposit = EXCLUDED.deposit,
          withdrawal = EXCLUDED.withdrawal
      `;
      
      await client.query(query, params);
    }

    res.json({ 
      success: true, 
      message: `${records.length} transações importadas com sucesso`,
      count: records.length
    });

  } catch (error) {
    console.error('Erro ao importar transações:', error);
    res.status(500).json({ 
      error: 'Erro ao importar transações', 
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// Rota para importar pagamentos
app.post('/api/import/payments', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const rows = parsePaymentsFile(req.file.buffer);
    
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Nenhum pagamento válido encontrado' });
    }

    const client = await getNeonClient();
    
    // Preparar dados para inserção
    const payload = rows.map((r) => ({
      natural_key: `${r.afiliados_id}|${(r.clientes_id ?? 'null')}|${r.date.toISOString().split('T')[0]}|${r.method}|${r.value}`,
      clientes_id: r.clientes_id,
      afiliados_id: r.afiliados_id,
      date: r.date.toISOString(),
      value: r.value,
      method: r.method,
      status: r.status,
      classification: r.classification,
      level: r.level,
    }));

    // Deduplicar por natural_key
    const byKey = new Map();
    for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
    const records = Array.from(byKey.values());

    // Inserir em lotes
    const CHUNK = 1000;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      
      const values = chunk.map((_, index) => {
        const baseIndex = index * 9;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9})`;
      }).join(', ');
      
      const params = chunk.flatMap(record => [
        record.natural_key, record.clientes_id, record.afiliados_id, record.date,
        record.value, record.method, record.status, record.classification, record.level
      ]);
      
      const query = `
        INSERT INTO payments (natural_key, clientes_id, afiliados_id, date, value, method, status, classification, level)
        VALUES ${values}
        ON CONFLICT (natural_key) DO UPDATE SET
          clientes_id = EXCLUDED.clientes_id,
          afiliados_id = EXCLUDED.afiliados_id,
          date = EXCLUDED.date,
          value = EXCLUDED.value,
          method = EXCLUDED.method,
          status = EXCLUDED.status,
          classification = EXCLUDED.classification,
          level = EXCLUDED.level
      `;
      
      await client.query(query, params);
    }

    res.json({ 
      success: true, 
      message: `${records.length} pagamentos importados com sucesso`,
      count: records.length
    });

  } catch (error) {
    console.error('Erro ao importar pagamentos:', error);
    res.status(500).json({ 
      error: 'Erro ao importar pagamentos', 
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// Rota para buscar contadores
app.get('/api/counts', async (req, res) => {
  try {
    const client = await getNeonClient();
    
    const [txCount, pyCount] = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM transactions'),
      client.query('SELECT COUNT(*) as count FROM payments'),
    ]);

    res.json({
      transactions: parseInt(txCount.rows[0].count),
      payments: parseInt(pyCount.rows[0].count)
    });

  } catch (error) {
    console.error('Erro ao buscar contadores:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar contadores', 
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// Rota para buscar semanas
app.get('/api/weeks', async (req, res) => {
  try {
    const client = await getNeonClient();
    
    const [txWeeks, pyWeeks] = await Promise.all([
      client.query(`
        SELECT DISTINCT (date_trunc('week', date AT TIME ZONE 'America/Sao_Paulo'))::date AS week_start
        FROM transactions
        ORDER BY week_start
      `),
      client.query(`
        SELECT DISTINCT (date_trunc('week', date AT TIME ZONE 'America/Sao_Paulo'))::date AS week_start
        FROM payments
        ORDER BY week_start
      `),
    ]);

    res.json({
      transactions: txWeeks.rows.map(row => row.week_start),
      payments: pyWeeks.rows.map(row => row.week_start)
    });

  } catch (error) {
    console.error('Erro ao buscar semanas:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar semanas', 
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// Rota para resetar dados
app.post('/api/reset', async (req, res) => {
  try {
    const client = await getNeonClient();
    
    const [txResult, pyResult] = await Promise.all([
      client.query('DELETE FROM transactions'),
      client.query('DELETE FROM payments'),
    ]);

    res.json({
      success: true,
      message: 'Dados resetados com sucesso',
      transactionsDeleted: txResult.rowCount,
      paymentsDeleted: pyResult.rowCount
    });

  } catch (error) {
    console.error('Erro ao resetar dados:', error);
    res.status(500).json({ 
      error: 'Erro ao resetar dados', 
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '../dist')));

// Rota catch-all para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Middleware de tratamento de erros global
app.use((error, req, res, next) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: error instanceof Error ? error.message : 'Erro desconhecido',
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor
const server = app.listen(port, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 SERVIDOR COMPLETO INICIADO!');
  console.log('=================================');
  console.log(`📍 Porta: ${port}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL Local: http://localhost:${port}`);
  console.log(`🔗 URL Externa: http://0.0.0.0:${port}`);
  console.log(`📊 Healthcheck: http://localhost:${port}/health`);
  console.log(`📁 Frontend: http://localhost:${port}`);
  console.log(`⚡ API: http://localhost:${port}/api`);
  console.log('=================================');
  
  // Verificar se a porta está realmente em uso
  const address = server.address();
  if (address && typeof address === 'object') {
    console.log(`✅ Servidor escutando em: ${address.address}:${address.port}`);
  }
}).on('error', (error) => {
  console.error('❌ ERRO AO INICIAR SERVIDOR:', error);
  console.error('Detalhes do erro:', {
    code: error.code,
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Recebido SIGINT, iniciando graceful shutdown...');
  
  try {
    if (neonClient) {
      console.log('Fechando conexão com banco...');
      await neonClient.end();
    }
    
    server.close(() => {
      console.log('Servidor HTTP fechado');
      process.exit(0);
    });
    
    // Timeout para forçar saída se necessário
    setTimeout(() => {
      console.error('Forçando saída após timeout');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('Erro durante shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('Recebido SIGTERM, iniciando graceful shutdown...');
  process.emit('SIGINT');
});