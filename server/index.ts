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
      // Configuração SSL mais robusta para Railway e outros provedores
      const sslConfig = process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false, require: true }
        : false;
        
      neonClient = new Client({ 
        connectionString: DATABASE_URL,
        ssl: sslConfig
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
    console.log('🔧 Verificando/criando tabelas...');
    
    // Criar tabela de transações
    await neonClient.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        customer_id VARCHAR(255) NOT NULL,
        date TIMESTAMP NOT NULL,
        ggr DECIMAL(15,2) DEFAULT 0,
        chargeback DECIMAL(15,2) DEFAULT 0,
        deposit DECIMAL(15,2) DEFAULT 0,
        withdrawal DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela transactions verificada/criada');
    
    // Migração: Alterar colunas DECIMAL(10,2) para DECIMAL(15,2) se necessário
    try {
      console.log('🔧 Verificando se migração de DECIMAL é necessária...');
      
      const columnInfo = await neonClient.query(`
        SELECT column_name, numeric_precision, numeric_scale 
        FROM information_schema.columns 
        WHERE table_name = 'transactions' 
        AND column_name IN ('ggr', 'chargeback', 'deposit', 'withdrawal')
        AND numeric_precision = 10
      `);
      
      if (columnInfo.rows.length > 0) {
        console.log('🔧 Executando migração para DECIMAL(15,2)...');
        
        await neonClient.query(`
          ALTER TABLE transactions 
          ALTER COLUMN ggr TYPE DECIMAL(15,2),
          ALTER COLUMN chargeback TYPE DECIMAL(15,2),
          ALTER COLUMN deposit TYPE DECIMAL(15,2),
          ALTER COLUMN withdrawal TYPE DECIMAL(15,2)
        `);
        
        console.log('✅ Migração DECIMAL(15,2) concluída com sucesso');
      } else {
        console.log('✅ Colunas já estão em DECIMAL(15,2)');
      }
    } catch (migrationError) {
      console.log('⚠️ Erro na migração (pode ser normal se já foi aplicada):', migrationError);
    }
    
    // Verificar se a coluna natural_key existe na tabela transactions
    const checkNaturalKeyTx = await neonClient.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'transactions' 
      AND column_name = 'natural_key'
    `);
    
    if (checkNaturalKeyTx.rows.length === 0) {
      console.log('🔧 Adicionando coluna natural_key à tabela transactions...');
      await neonClient.query(`
        ALTER TABLE transactions 
        ADD COLUMN natural_key VARCHAR(255)
      `);
      
      // Gerar natural_key para registros existentes (se houver)
      await neonClient.query(`
        UPDATE transactions 
        SET natural_key = customer_id || '|' || date || '|' || ggr || '|' || chargeback || '|' || deposit || '|' || withdrawal || '|' || id
        WHERE natural_key IS NULL
      `);
      
      // Adicionar constraint UNIQUE
      await neonClient.query(`
        ALTER TABLE transactions 
        ADD CONSTRAINT transactions_natural_key_unique UNIQUE (natural_key)
      `);
      
      console.log('✅ Coluna natural_key adicionada à tabela transactions');
    } else {
      console.log('✅ Coluna natural_key já existe na tabela transactions');
    }
    
    // Criar tabela de pagamentos
    await neonClient.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
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
    console.log('✅ Tabela payments verificada/criada');
    
    // Verificar se a coluna natural_key existe na tabela payments
    const checkNaturalKeyPy = await neonClient.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'payments' 
      AND column_name = 'natural_key'
    `);
    
    if (checkNaturalKeyPy.rows.length === 0) {
      console.log('🔧 Adicionando coluna natural_key à tabela payments...');
      await neonClient.query(`
        ALTER TABLE payments 
        ADD COLUMN natural_key VARCHAR(255)
      `);
      
      // Gerar natural_key para registros existentes (se houver)
      await neonClient.query(`
        UPDATE payments 
        SET natural_key = COALESCE(clientes_id, 'null') || '|' || afiliados_id || '|' || date || '|' || value || '|' || id
        WHERE natural_key IS NULL
      `);
      
      // Adicionar constraint UNIQUE
      await neonClient.query(`
        ALTER TABLE payments 
        ADD CONSTRAINT payments_natural_key_unique UNIQUE (natural_key)
      `);
      
      console.log('✅ Coluna natural_key adicionada à tabela payments');
    } else {
      console.log('✅ Coluna natural_key já existe na tabela payments');
    }
    
    // Verificar se as tabelas existem e contar registros
    const txCount = await neonClient.query('SELECT COUNT(*) as count FROM transactions');
    const pyCount = await neonClient.query('SELECT COUNT(*) as count FROM payments');
    
    console.log(`📊 Estado atual: ${txCount.rows[0].count} transações, ${pyCount.rows[0].count} pagamentos`);
    console.log('✅ Tabelas verificadas/criadas com sucesso');
    
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error);
  }
};

// Função para processar arquivo de transações
const parseTransactionsFile = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'dd/mm/yyyy' });
  
  if (data.length === 0) return [];
  
  // Função para limpar valores monetários brasileiros
  const cleanMonetaryValue = (value: any): number => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    
    // Remover R$, espaços e tratar valores negativos
    let cleaned = value
      .replace(/R\$\s*/g, '')     // Remove R$
      .replace(/\s+/g, '')        // Remove espaços
      .replace(/-+/g, '0')        // Converte - para 0
      .trim();
    
    // Se for vazio ou só traços, retornar 0
    if (!cleaned || cleaned === '0') return 0;
    
    // Tratar valores negativos (ex: "-R$ 300.32")
    const isNegative = value.includes('-') && !value.includes('R$ -');
    
    // Formato brasileiro: 1.234.567,89
    // Remover pontos que são separadores de milhares (exceto o último ponto se não há vírgula)
    if (cleaned.includes(',')) {
      // Se tem vírgula, os pontos são separadores de milhares
      const parts = cleaned.split(',');
      const integerPart = parts[0].replace(/\./g, ''); // Remove todos os pontos da parte inteira
      const decimalPart = parts[1] || '0';
      cleaned = integerPart + '.' + decimalPart;
    } else if (cleaned.includes('.')) {
      // Se não tem vírgula mas tem ponto, verificar se é decimal ou separador de milhares
      const parts = cleaned.split('.');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Provavelmente é decimal (ex: 1000.50)
        cleaned = cleaned;
      } else {
        // Provavelmente são separadores de milhares (ex: 1.000.000)
        cleaned = cleaned.replace(/\./g, '');
      }
    }
    
    // Remover caracteres não numéricos exceto ponto decimal
    cleaned = cleaned.replace(/[^\d.-]/g, '');
    
    const result = parseFloat(cleaned) || 0;
    return isNegative ? -result : result;
  };
  
  // Obter cabeçalhos da primeira linha e limpar espaços
  const headers = (data[0] as string[]).map(h => h ? h.toString().trim() : '');
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
  const depositIndex = getColumnIndex(['valor_deposito', 'deposit', 'deposito']); // Priorizar valor_deposito
  const withdrawalIndex = getColumnIndex(['valor_saque', 'withdrawal', 'saque']); // Priorizar valor_saque
  
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
      date: parseDate(row[dateIndex]),
      ggr: cleanMonetaryValue(row[ggrIndex]),
      chargeback: cleanMonetaryValue(row[chargebackIndex]),
      deposit: cleanMonetaryValue(row[depositIndex]),
      withdrawal: cleanMonetaryValue(row[withdrawalIndex]),
    };
  }).filter((t) => t.customer_id && !isNaN(t.date.getTime()));
  
  console.log(`🎯 Processamento concluído: ${results.length.toLocaleString()} registros válidos`);
  
  // Log de debug - mostrar primeiros 3 registros processados
  if (results.length > 0) {
    console.log('🔍 DEBUG - Primeiros 3 registros processados:');
    for (let i = 0; i < Math.min(3, results.length); i++) {
      const tx = results[i];
      console.log(`  ${i+1}. Depósito: ${tx.deposit}, GGR: ${tx.ggr}, Saque: ${tx.withdrawal}`);
    }
    
    // Mostrar valores máximos
    const maxDeposit = Math.max(...results.map(tx => tx.deposit || 0));
    const maxGGR = Math.max(...results.map(tx => tx.ggr || 0));
    console.log(`🔍 DEBUG - Valores máximos: Depósito: ${maxDeposit}, GGR: ${maxGGR}`);
  }
  
  return results;
};

// Função para processar datas corretamente
const parseDate = (value: any): Date => {
  if (value instanceof Date) {
    return value;
  }
  
  if (typeof value === 'number') {
    // Número serial do Excel
    const excelEpoch = new Date(1900, 0, 1);
    const days = value - 2; // Ajuste para diferença do Excel
    return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
  }
  
  if (typeof value === 'string') {
    // Tentar diferentes formatos de data
    const formats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // dd/mm/yyyy
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // yyyy-mm-dd
    ];
    
    for (const format of formats) {
      const match = value.match(format);
      if (match) {
        if (format === formats[0]) {
          // dd/mm/yyyy
          const [, day, month, year] = match;
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else {
          // yyyy-mm-dd
          const [, year, month, day] = match;
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
      }
    }
    
    // Fallback para Date constructor
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  // Se nada funcionar, retornar data inválida
  return new Date(NaN);
};

// Função para processar arquivo de pagamentos
const parsePaymentsFile = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
  
  if (data.length === 0) return [];
  
  // Função para limpar valores monetários brasileiros
  const cleanMonetaryValue = (value: any): number => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    
    // Remover R$, espaços e tratar valores negativos
    let cleaned = value
      .replace(/R\$\s*/g, '')     // Remove R$
      .replace(/\s+/g, '')        // Remove espaços
      .replace(/-+/g, '0')        // Converte - para 0
      .trim();
    
    // Se for vazio ou só traços, retornar 0
    if (!cleaned || cleaned === '0') return 0;
    
    // Tratar valores negativos (ex: "-R$ 300.32")
    const isNegative = value.includes('-') && !value.includes('R$ -');
    
    // Formato brasileiro: 1.234.567,89
    // Remover pontos que são separadores de milhares (exceto o último ponto se não há vírgula)
    if (cleaned.includes(',')) {
      // Se tem vírgula, os pontos são separadores de milhares
      const parts = cleaned.split(',');
      const integerPart = parts[0].replace(/\./g, ''); // Remove todos os pontos da parte inteira
      const decimalPart = parts[1] || '0';
      cleaned = integerPart + '.' + decimalPart;
    } else if (cleaned.includes('.')) {
      // Se não tem vírgula mas tem ponto, verificar se é decimal ou separador de milhares
      const parts = cleaned.split('.');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Provavelmente é decimal (ex: 1000.50)
        cleaned = cleaned;
      } else {
        // Provavelmente são separadores de milhares (ex: 1.000.000)
        cleaned = cleaned.replace(/\./g, '');
      }
    }
    
    // Remover caracteres não numéricos exceto ponto decimal
    cleaned = cleaned.replace(/[^\d.-]/g, '');
    
    const result = parseFloat(cleaned) || 0;
    return isNegative ? -result : result;
  };
  
  // Obter cabeçalhos da primeira linha e limpar espaços
  const headers = (data[0] as string[]).map(h => h ? h.toString().trim() : '');
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
      date: parseDate(row[dateIndex]),
      value: cleanMonetaryValue(row[valueIndex]),
      method: String(row[methodIndex]) || 'cpa',
      status: String(row[statusIndex]) || 'finish',
      classification: String(row[classificationIndex]) || 'normal',
      level: parseInt(row[levelIndex]) || 1,
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
      natural_key: `${r.customer_id}|${r.date.toISOString()}|${r.ggr}|${r.chargeback}|${r.deposit}|${r.withdrawal}|${index}`,
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
      
      console.log(`🔍 DEBUG - Executando query para ${chunk.length} registros`);
      console.log(`🔍 DEBUG - Primeiros 3 parâmetros:`, params.slice(0, 21)); // 3 registros x 7 campos
      
      try {
        const result = await client.query(query, params);
        console.log(`🔍 DEBUG - Query executada com sucesso, ${result.rows.length} linhas retornadas`);
        console.log(`🔍 DEBUG - Primeiras 3 linhas do resultado:`, result.rows.slice(0, 3));
        
        // Contar inserções vs atualizações
        const inserted = result.rows.filter(row => row.inserted).length;
        const updated = result.rows.length - inserted;
        
        totalInserted += inserted;
        totalUpdated += updated;
        
        console.log(`✅ Lote ${chunkIndex}/${totalChunks} concluído: ${inserted} inseridas, ${updated} atualizadas (Total: ${totalInserted + totalUpdated}/${records.length})`);
        
        // Verificar se dados foram realmente inseridos
        const verifyCount = await client.query('SELECT COUNT(*) as count FROM transactions');
        console.log(`🔍 DEBUG - Total de transações na tabela após inserção: ${verifyCount.rows[0].count}`);
        
      } catch (queryError) {
        console.error(`❌ ERRO na query do lote ${chunkIndex}:`, queryError);
        throw queryError;
      }
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
      
      console.log(`🔍 DEBUG - Executando query de pagamentos para ${chunk.length} registros`);
      console.log(`🔍 DEBUG - Primeiros 3 parâmetros:`, params.slice(0, 27)); // 3 registros x 9 campos
      
      try {
        const result = await client.query(query, params);
        console.log(`🔍 DEBUG - Query de pagamentos executada com sucesso, ${result.rows.length} linhas retornadas`);
        console.log(`🔍 DEBUG - Primeiras 3 linhas do resultado:`, result.rows.slice(0, 3));
        
        // Contar inserções vs atualizações
        const inserted = result.rows.filter(row => row.inserted).length;
        const updated = result.rows.length - inserted;
        
        totalInserted += inserted;
        totalUpdated += updated;
        
        console.log(`✅ Lote ${chunkIndex}/${totalChunks} concluído: ${inserted} inseridos, ${updated} atualizados (Total: ${totalInserted + totalUpdated}/${records.length})`);
        
        // Verificar se dados foram realmente inseridos
        const verifyCount = await client.query('SELECT COUNT(*) as count FROM payments');
        console.log(`🔍 DEBUG - Total de pagamentos na tabela após inserção: ${verifyCount.rows[0].count}`);
        
      } catch (queryError) {
        console.error(`❌ ERRO na query de pagamentos do lote ${chunkIndex}:`, queryError);
        throw queryError;
      }
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

// Rota de debug para verificar totais
app.get('/api/debug/totals', async (req, res) => {
  try {
    const client = await getNeonClient();
    
    // Totais de transações
    const transactionTotals = await client.query(`
      SELECT 
        COUNT(*) as total_records,
        SUM(deposit) as total_deposit,
        SUM(ggr) as total_ggr,
        SUM(withdrawal) as total_withdrawal,
        SUM(chargeback) as total_chargeback,
        MAX(deposit) as max_deposit,
        MAX(ggr) as max_ggr
      FROM transactions
    `);
    
    // Totais de pagamentos
    const paymentTotals = await client.query(`
      SELECT 
        COUNT(*) as total_records,
        SUM(value) as total_value,
        MAX(value) as max_value
      FROM payments
    `);
    
    // Amostra de registros com valores altos
    const sampleTransactions = await client.query(`
      SELECT deposit, ggr, withdrawal, chargeback 
      FROM transactions 
      WHERE deposit > 100 OR ggr > 100
      ORDER BY deposit DESC 
      LIMIT 10
    `);
    
    const tx = transactionTotals.rows[0];
    const py = paymentTotals.rows[0];
    
    res.json({
      transactions: {
        count: parseInt(tx.total_records),
        totalDeposit: parseFloat(tx.total_deposit || 0),
        totalGGR: parseFloat(tx.total_ggr || 0),
        totalWithdrawal: parseFloat(tx.total_withdrawal || 0),
        totalChargeback: parseFloat(tx.total_chargeback || 0),
        maxDeposit: parseFloat(tx.max_deposit || 0),
        maxGGR: parseFloat(tx.max_ggr || 0)
      },
      payments: {
        count: parseInt(py.total_records),
        totalValue: parseFloat(py.total_value || 0),
        maxValue: parseFloat(py.max_value || 0)
      },
      sampleHighValueTransactions: sampleTransactions.rows,
      expectedValues: {
        deposit: 8503883.29,
        ggr: 2167277.88,
        payments: 4587711.31
      }
    });

  } catch (error) {
    console.error('Erro ao buscar totais de debug:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar totais de debug', 
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