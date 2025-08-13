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
app.get('/health', async (req, res) => {
  try {
    let databaseStatus = 'unknown';
    let databaseError = null;
    
    try {
      const client = await getNeonClient();
      await client.query('SELECT 1');
      databaseStatus = 'connected';
    } catch (error) {
      databaseStatus = 'error';
      databaseError = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('❌ Erro na verificação do banco:', error);
    }
    
    const healthData = {
      status: databaseStatus === 'connected' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      port: port,
      database: {
        status: databaseStatus,
        error: databaseError,
        url: DATABASE_URL ? 'configured' : 'missing'
      },
      message: databaseStatus === 'connected' 
        ? 'Server is running and healthy' 
        : 'Server is running but database is unavailable'
    };
    
    const statusCode = databaseStatus === 'connected' ? 200 : 503;
    res.status(statusCode).json(healthData);
    
  } catch (error) {
    console.error('Erro no healthcheck:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      timestamp: new Date().toISOString()
    });
  }
});

// Rota de healthcheck simples para o Railway (sem dependências)
app.get('/health/simple', (req, res) => {
  res.status(200).send('OK');
});

// Configuração do multer para upload de arquivos
const upload = multer({ storage: multer.memoryStorage() });

// Configuração do banco - priorizar DATABASE_URL do Railway
const DATABASE_URL = process.env.DATABASE_URL || 
  process.env.NEON_DATABASE_URL || 
  "postgresql://neondb_owner:npg_SjN6yxOIKnc1@ep-green-surf-adprt5l3-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";

console.log('🔗 Configuração do banco:', {
  hasDatabase: !!DATABASE_URL,
  environment: process.env.NODE_ENV || 'development',
  databaseSource: process.env.DATABASE_URL ? 'Railway' : 'Neon'
});

// Cliente do banco
let neonClient: Client | null = null;

const getNeonClient = async () => {
  if (!neonClient) {
    try {
      neonClient = new Client({ 
        connectionString: DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      await neonClient.connect();
      console.log('✅ Conectado ao banco de dados com sucesso');
      
      // Criar tabelas se não existirem
      await createTablesIfNotExist();
      
    } catch (error) {
      console.error('❌ Erro ao conectar ao banco:', error);
      neonClient = null;
      throw error;
    }
  }
  return neonClient;
};

// Função para criar tabelas se não existirem
const createTablesIfNotExist = async () => {
  if (!neonClient) return;
  
  try {
    // Criar tabela de transações
    await neonClient.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        natural_key VARCHAR(255) UNIQUE NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        date TIMESTAMP NOT NULL,
        ggr DECIMAL(10,2) DEFAULT 0,
        chargeback DECIMAL(10,2) DEFAULT 0,
        deposit DECIMAL(10,2) DEFAULT 0,
        withdrawal DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Criar tabela de pagamentos
    await neonClient.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        natural_key VARCHAR(255) UNIQUE NOT NULL,
        clientes_id VARCHAR(255),
        afiliados_id VARCHAR(255) NOT NULL,
        date TIMESTAMP NOT NULL,
        value DECIMAL(10,2) DEFAULT 0,
        method VARCHAR(50) DEFAULT 'cpa',
        status VARCHAR(50) DEFAULT 'finish',
        classification VARCHAR(50) DEFAULT 'normal',
        level INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Tabelas verificadas/criadas com sucesso');
    
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error);
  }
};

// Função para processar arquivo de transações
const parseTransactionsFile = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (data.length === 0) return [];
  
  // Obter cabeçalhos da primeira linha
  const headers = data[0] as string[];
  const rows = data.slice(1);
  
  // Mapear índices das colunas
  const getColumnIndex = (possibleNames: string[]) => {
    for (const name of possibleNames) {
      const index = headers.findIndex(h => 
        h && h.toString().toLowerCase().includes(name.toLowerCase())
      );
      if (index !== -1) return index;
    }
    return -1;
  };
  
  const customerIdIndex = getColumnIndex(['customer_id', 'customer', 'cliente']);
  const dateIndex = getColumnIndex(['date', 'data']);
  const ggrIndex = getColumnIndex(['ggr']);
  const chargebackIndex = getColumnIndex(['chargeback']);
  const depositIndex = getColumnIndex(['deposit', 'deposito', 'valor_deposito']);
  const withdrawalIndex = getColumnIndex(['withdrawal', 'saque', 'valor_saque']);
  
  console.log('Mapeamento de colunas para transações:', {
    headers,
    customerIdIndex,
    dateIndex,
    ggrIndex,
    chargebackIndex,
    depositIndex,
    withdrawalIndex
  });
  
  console.log(`📊 Processando ${rows.length.toLocaleString()} linhas de transações`);
  
  const validRows = rows.filter((row: any) => row[customerIdIndex] && row[dateIndex]);
  console.log(`✅ ${validRows.length.toLocaleString()} linhas válidas encontradas`);
  
  let processedCount = 0;
  const results = validRows.map((row: any) => {
    processedCount++;
    
    // Log de progresso a cada 10000 registros
    if (processedCount % 10000 === 0) {
      console.log(`⏳ Processados ${processedCount.toLocaleString()} de ${validRows.length.toLocaleString()} registros (${(processedCount/validRows.length*100).toFixed(1)}%)`);
    }
    
    return {
      customer_id: String(row[customerIdIndex]),
      date: new Date(row[dateIndex]),
      ggr: Number(row[ggrIndex]) || 0,
      chargeback: Number(row[chargebackIndex]) || 0,
      deposit: Number(row[depositIndex]) || 0,
      withdrawal: Number(row[withdrawalIndex]) || 0,
    };
  }).filter((t) => t.customer_id && !isNaN(t.date.getTime()));
  
  console.log(`🎯 Processamento concluído: ${results.length.toLocaleString()} registros válidos`);
  return results;
};

// Função para processar arquivo de pagamentos
const parsePaymentsFile = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (data.length === 0) return [];
  
  // Obter cabeçalhos da primeira linha
  const headers = data[0] as string[];
  const rows = data.slice(1);
  
  // Mapear índices das colunas
  const getColumnIndex = (possibleNames: string[]) => {
    for (const name of possibleNames) {
      const index = headers.findIndex(h => 
        h && h.toString().toLowerCase().includes(name.toLowerCase())
      );
      if (index !== -1) return index;
    }
    return -1;
  };
  
  const clientesIdIndex = getColumnIndex(['clientes_id', 'cliente_id', 'customer_id']);
  const afiliadosIdIndex = getColumnIndex(['afiliados_id', 'afiliado_id', 'affiliate_id']);
  const dateIndex = getColumnIndex(['date', 'data']);
  const valueIndex = getColumnIndex(['value', 'valor']);
  const methodIndex = getColumnIndex(['method', 'metodo']);
  const statusIndex = getColumnIndex(['status']);
  const classificationIndex = getColumnIndex(['classification', 'classificacao']);
  const levelIndex = getColumnIndex(['level', 'nivel']);
  
  console.log('Mapeamento de colunas para pagamentos:', {
    headers,
    clientesIdIndex,
    afiliadosIdIndex,
    dateIndex,
    valueIndex,
    methodIndex,
    statusIndex,
    classificationIndex,
    levelIndex
  });
  
  console.log(`📊 Processando ${rows.length.toLocaleString()} linhas de pagamentos`);
  
  const validRows = rows.filter((row: any) => row[afiliadosIdIndex] && row[dateIndex]);
  console.log(`✅ ${validRows.length.toLocaleString()} linhas válidas encontradas`);
  
  let processedCount = 0;
  const results = validRows.map((row: any) => {
    processedCount++;
    
    // Log de progresso a cada 10000 registros
    if (processedCount % 10000 === 0) {
      console.log(`⏳ Processados ${processedCount.toLocaleString()} de ${validRows.length.toLocaleString()} registros (${(processedCount/validRows.length*100).toFixed(1)}%)`);
    }
    
    return {
      clientes_id: row[clientesIdIndex] ? String(row[clientesIdIndex]) : null,
      afiliados_id: String(row[afiliadosIdIndex]),
      date: new Date(row[dateIndex]),
      value: Number(row[valueIndex]) || 0,
      method: String(row[methodIndex]) || 'cpa',
      status: String(row[statusIndex]) || 'finish',
      classification: String(row[classificationIndex]) || 'normal',
      level: Number(row[levelIndex]) || 1,
    };
  }).filter((p) => !!p.afiliados_id && !isNaN(p.date.getTime()));
  
  console.log(`🎯 Processamento concluído: ${results.length.toLocaleString()} registros válidos`);
  return results;
};

// Rota para importar transações
app.post('/api/import/transactions', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    console.log(`Processando arquivo de transações: ${req.file.originalname}, tamanho: ${req.file.size} bytes`);

    const rows = parseTransactionsFile(req.file.buffer);
    
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Nenhuma transação válida encontrada no arquivo' });
    }

    console.log(`${rows.length} transações válidas encontradas`);

    const client = await getNeonClient();
    
    // Preparar dados para inserção
    const payload = rows.map((r, index) => ({
      natural_key: `${r.customer_id}|${r.date.toISOString()}|${r.ggr}|${r.deposit}|${r.withdrawal}|${index}`,
      customer_id: r.customer_id,
      date: r.date.toISOString(),
      ggr: r.ggr,
      chargeback: r.chargeback,
      deposit: r.deposit,
      withdrawal: r.withdrawal,
    }));

    // Deduplicar por natural_key
    const byKey = new Map<string, typeof payload[number]>();
    for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
    const records = Array.from(byKey.values());

    console.log(`${records.length} transações únicas após deduplicação`);

    let totalInserted = 0;
    let totalUpdated = 0;

    // Inserir em lotes com logs de progresso
    const CHUNK = 1000;
    const totalChunks = Math.ceil(records.length / CHUNK);
    
    console.log(`🔄 Iniciando inserção em ${totalChunks} lotes de ${CHUNK} registros`);
    
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunkIndex = Math.floor(i / CHUNK) + 1;
      const chunk = records.slice(i, i + CHUNK);
      
      console.log(`⏳ Processando lote ${chunkIndex}/${totalChunks} (${chunk.length} registros)`);
      
      const values = chunk.map((_, index) => {
        const baseIndex = index * 7;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7})`;
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
        RETURNING (xmax = 0) AS inserted
      `;
      
      const result = await client.query(query, params);
      
      // Contar inserções vs atualizações
      const inserted = result.rows.filter(row => row.inserted).length;
      const updated = result.rows.length - inserted;
      
      totalInserted += inserted;
      totalUpdated += updated;
      
      console.log(`✅ Lote ${chunkIndex}/${totalChunks} concluído: ${inserted} inseridas, ${updated} atualizadas (Total: ${totalInserted + totalUpdated}/${records.length})`);
    }

    console.log(`🎉 Importação concluída: ${totalInserted} inseridas, ${totalUpdated} atualizadas`);

    res.json({ 
      success: true, 
      message: `Transações importadas com sucesso`,
      total: records.length,
      inserted: totalInserted,
      updated: totalUpdated
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

    console.log(`Processando arquivo de pagamentos: ${req.file.originalname}, tamanho: ${req.file.size} bytes`);

    const rows = parsePaymentsFile(req.file.buffer);
    
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Nenhum pagamento válido encontrado no arquivo' });
    }

    console.log(`${rows.length} pagamentos válidos encontrados`);

    const client = await getNeonClient();
    
    // Preparar dados para inserção
    const payload = rows.map((r, index) => ({
      natural_key: `${r.afiliados_id}|${(r.clientes_id ?? 'null')}|${r.date.toISOString()}|${r.method}|${r.value}|${r.level}|${index}`,
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
    const byKey = new Map<string, typeof payload[number]>();
    for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
    const records = Array.from(byKey.values());

    console.log(`${records.length} pagamentos únicos após deduplicação`);

    let totalInserted = 0;
    let totalUpdated = 0;

    // Inserir em lotes com logs de progresso
    const CHUNK = 1000;
    const totalChunks = Math.ceil(records.length / CHUNK);
    
    console.log(`🔄 Iniciando inserção em ${totalChunks} lotes de ${CHUNK} registros`);
    
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunkIndex = Math.floor(i / CHUNK) + 1;
      const chunk = records.slice(i, i + CHUNK);
      
      console.log(`⏳ Processando lote ${chunkIndex}/${totalChunks} (${chunk.length} registros)`);
      
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
        RETURNING (xmax = 0) AS inserted
      `;
      
      const result = await client.query(query, params);
      
      // Contar inserções vs atualizações
      const inserted = result.rows.filter(row => row.inserted).length;
      const updated = result.rows.length - inserted;
      
      totalInserted += inserted;
      totalUpdated += updated;
      
      console.log(`✅ Lote ${chunkIndex}/${totalChunks} concluído: ${inserted} inseridos, ${updated} atualizados (Total: ${totalInserted + totalUpdated}/${records.length})`);
    }

    console.log(`🎉 Importação concluída: ${totalInserted} inseridos, ${totalUpdated} atualizados`);

    res.json({ 
      success: true, 
      message: `Pagamentos importados com sucesso`,
      total: records.length,
      inserted: totalInserted,
      updated: totalUpdated
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

// Rota para buscar todas as transações
app.get('/api/transactions', async (req, res) => {
  try {
    const client = await getNeonClient();
    const { limit, offset } = req.query;
    
    let query = 'SELECT * FROM transactions ORDER BY date DESC';
    const params: any[] = [];
    
    if (limit) {
      query += ' LIMIT $1';
      params.push(parseInt(limit as string));
      
      if (offset) {
        query += ' OFFSET $2';
        params.push(parseInt(offset as string));
      }
    }
    
    const result = await client.query(query, params);
    res.json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar transações:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar transações', 
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// Rota para buscar todos os pagamentos
app.get('/api/payments', async (req, res) => {
  try {
    const client = await getNeonClient();
    const { limit, offset } = req.query;
    
    let query = 'SELECT * FROM payments ORDER BY date DESC';
    const params: any[] = [];
    
    if (limit) {
      query += ' LIMIT $1';
      params.push(parseInt(limit as string));
      
      if (offset) {
        query += ' OFFSET $2';
        params.push(parseInt(offset as string));
      }
    }
    
    const result = await client.query(query, params);
    res.json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar pagamentos', 
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
app.use((error: any, req: any, res: any, next: any) => {
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
  console.log('🚀 SERVIDOR INICIADO COM SUCESSO!');
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