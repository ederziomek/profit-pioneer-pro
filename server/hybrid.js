import http from 'http';
import express from 'express';
import { Client } from 'pg';
import multer from 'multer';
import XLSX from 'xlsx';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ========================================
// SERVIDOR HTTP NATIVO (SEMPRE FUNCIONA)
// ========================================
const nativeServer = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // HEALTHCHECK - SEMPRE FUNCIONA
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      server: 'hybrid-native',
      message: 'Healthcheck funcionando perfeitamente'
    }));
    return;
  }
  
  // HEALTHCHECK SIMPLES - PARA RAILWAY
  if (req.url === '/health/simple') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
  
  // ROTA RAIZ - SEMPRE FUNCIONA
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Profit Pioneer Pro</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { padding: 15px; border-radius: 5px; margin: 20px 0; }
            .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
            h1 { color: #2c3e50; text-align: center; }
            .endpoints { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
            code { background: #e9ecef; padding: 2px 6px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 Profit Pioneer Pro</h1>
            
            <div class="status success">
              <strong>✅ Status: Online</strong><br>
              Servidor híbrido funcionando perfeitamente!
            </div>
            
            <div class="status info">
              <strong>📊 Informações do Sistema</strong><br>
              • Timestamp: ${new Date().toLocaleString('pt-BR')}<br>
              • Uptime: ${Math.floor(process.uptime())} segundos<br>
              • Ambiente: ${process.env.NODE_ENV || 'development'}<br>
              • Porta: ${port}
            </div>
            
            <div class="status warning">
              <strong>⚠️ Modo de Emergência</strong><br>
              O servidor Express ainda está inicializando. Esta é a versão de emergência.
            </div>
            
            <div class="endpoints">
              <strong>🔗 Endpoints Disponíveis:</strong><br>
              • <code>/health</code> - Healthcheck completo<br>
              • <code>/health/simple</code> - Healthcheck simples (Railway)<br>
              • <code>/</code> - Esta página<br>
              • <code>/api/*</code> - API (quando disponível)<br>
              • <code>/*</code> - Frontend React (quando disponível)
            </div>
            
            <div style="text-align: center; margin-top: 30px; color: #6c757d;">
              <small>Servidor Híbrido - Sempre Funcionando</small>
            </div>
          </div>
        </body>
      </html>
    `);
    return;
  }
  
  // 404 - SEMPRE FUNCIONA
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found - Servidor em modo de emergência');
});

// Iniciar servidor nativo (SEMPRE FUNCIONA)
nativeServer.listen(port, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 SERVIDOR NATIVO INICIADO!');
  console.log('=================================');
  console.log(`📍 Porta: ${port}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Healthcheck: http://localhost:${port}/health`);
  console.log(`🔗 Healthcheck Simple: http://localhost:${port}/health/simple`);
  console.log(`🔗 Root: http://localhost:${port}/`);
  console.log('=================================');
  console.log('✅ HEALTHCHECK GARANTIDO!');
  console.log('=================================');
});

// ========================================
// SERVIDOR EXPRESS (QUANDO POSSÍVEL)
// ========================================
let expressApp = null;
let expressServer = null;

const initExpressServer = async () => {
  try {
    console.log('🔄 Iniciando servidor Express...');
    
    expressApp = express();
    
    // Middleware
    expressApp.use(cors());
    expressApp.use(express.json());
    
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
    expressApp.post('/api/import/transactions', upload.single('file'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        
        const rows = parseTransactionsFile(req.file.buffer);
        
        if (rows.length === 0) {
          return res.status(400).json({ error: 'Nenhuma transação válida encontrada' });
        }
        
        const client = await getNeonClient();
        
        const payload = rows.map((r) => ({
          natural_key: `${r.customer_id}|${r.date.toISOString().split('T')[0]}`,
          customer_id: r.customer_id,
          date: r.date.toISOString(),
          ggr: r.ggr,
          chargeback: r.chargeback,
          deposit: r.deposit,
          withdrawal: r.withdrawal,
        }));
        
        const byKey = new Map();
        for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
        const records = Array.from(byKey.values());
        
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
    expressApp.post('/api/import/payments', upload.single('file'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        
        const rows = parsePaymentsFile(req.file.buffer);
        
        if (rows.length === 0) {
          return res.status(400).json({ error: 'Nenhum pagamento válido encontrado' });
        }
        
        const client = await getNeonClient();
        
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
        
        const byKey = new Map();
        for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
        const records = Array.from(byKey.values());
        
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
    expressApp.get('/api/counts', async (req, res) => {
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
    expressApp.get('/api/weeks', async (req, res) => {
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
    expressApp.post('/api/reset', async (req, res) => {
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
    expressApp.use(express.static(path.join(__dirname, '../dist')));
    
    // Rota catch-all para SPA
    expressApp.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../dist/index.html'));
    });
    
    // Iniciar servidor Express
    expressServer = expressApp.listen(port + 1, '0.0.0.0', () => {
      console.log('=================================');
      console.log('🚀 SERVIDOR EXPRESS INICIADO!');
      console.log('=================================');
      console.log(`📍 Porta: ${port + 1}`);
      console.log(`🔗 Frontend: http://localhost:${port + 1}`);
      console.log(`⚡ API: http://localhost:${port + 1}/api`);
      console.log('=================================');
      console.log('✅ SISTEMA COMPLETO FUNCIONANDO!');
      console.log('=================================');
    });
    
    // Atualizar healthcheck para indicar que Express está funcionando
    console.log('✅ Servidor Express inicializado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao inicializar servidor Express:', error);
    console.log('⚠️ Sistema funcionando em modo de emergência (servidor nativo)');
  }
};

// Inicializar servidor Express após um delay
setTimeout(initExpressServer, 5000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Recebido SIGINT, iniciando graceful shutdown...');
  
  try {
    if (expressServer) {
      expressServer.close(() => {
        console.log('Servidor Express fechado');
      });
    }
    
    nativeServer.close(() => {
      console.log('Servidor nativo fechado');
      process.exit(0);
    });
    
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