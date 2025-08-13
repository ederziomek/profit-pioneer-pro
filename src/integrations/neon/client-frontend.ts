// Cliente Neon para frontend - processa dados localmente
// Este arquivo é específico para o frontend e não depende de módulos Node.js

// Armazenamento local temporário para demonstração
let localTransactions: any[] = [];
let localPayments: any[] = [];

// Função para executar queries diretas (usada no Database.tsx)
export const executeDirectQuery = async (query: string) => {
  try {
    if (query.includes('COUNT(*) FROM transactions')) {
      return { rows: [{ count: localTransactions.length.toString() }] };
    }
    
    if (query.includes('COUNT(*) FROM payments')) {
      return { rows: [{ count: localPayments.length.toString() }] };
    }
    
    if (query.includes('SELECT * FROM transactions')) {
      return { rows: localTransactions };
    }
    
    if (query.includes('SELECT * FROM payments')) {
      return { rows: localPayments };
    }
    
    if (query.includes('date_trunc')) {
      // Para queries de semanas
      const table = query.includes('transactions') ? localTransactions : localPayments;
      const weeks = [...new Set(table.map(row => {
        const date = new Date(row.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().split('T')[0];
      }))].sort();
      
      return { rows: weeks.map(week => ({ week_start: week })) };
    }
    
    console.log('Query não reconhecida:', query);
    return { rows: [] };
  } catch (error) {
    console.error('Erro na query direta:', error);
    throw error;
  }
};

// Função para executar queries com parâmetros
export const executeQueryWithParams = async (query: string, params: any[]) => {
  try {
    if (query.includes('INSERT INTO transactions')) {
      // Simular inserção de transações
      const newTransactions = params.filter((_, i) => i % 6 === 0).map((_, index) => {
        const baseIndex = index * 6;
        return {
          natural_key: params[baseIndex],
          customer_id: params[baseIndex + 1],
          date: params[baseIndex + 2],
          ggr: params[baseIndex + 3],
          chargeback: params[baseIndex + 4],
          deposit: params[baseIndex + 5],
          withdrawal: params[baseIndex + 6],
        };
      });
      
      localTransactions = [...localTransactions, ...newTransactions];
      return { rowCount: newTransactions.length };
    }
    
    if (query.includes('INSERT INTO payments')) {
      // Simular inserção de pagamentos
      const newPayments = params.filter((_, i) => i % 9 === 0).map((_, index) => {
        const baseIndex = index * 9;
        return {
          natural_key: params[baseIndex],
          clientes_id: params[baseIndex + 1],
          afiliados_id: params[baseIndex + 2],
          date: params[baseIndex + 3],
          value: params[baseIndex + 4],
          method: params[baseIndex + 5],
          status: params[baseIndex + 6],
          classification: params[baseIndex + 7],
          level: params[baseIndex + 8],
        };
      });
      
      localPayments = [...localPayments, ...newPayments];
      return { rowCount: newPayments.length };
    }
    
    if (query.includes('DELETE FROM transactions')) {
      const count = localTransactions.length;
      localTransactions = [];
      return { rowCount: count };
    }
    
    if (query.includes('DELETE FROM payments')) {
      const count = localPayments.length;
      localPayments = [];
      return { rowCount: count };
    }
    
    if (query.includes('SELECT * FROM transactions ORDER BY date DESC LIMIT')) {
      const limit = params[0];
      const offset = params[1];
      const sorted = [...localTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return { rows: sorted.slice(offset, offset + limit) };
    }
    
    if (query.includes('SELECT * FROM payments ORDER BY date DESC LIMIT')) {
      const limit = params[0];
      const offset = params[1];
      const sorted = [...localPayments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return { rows: sorted.slice(offset, offset + limit) };
    }
    
    console.log('Query com parâmetros não reconhecida:', query, params);
    return { rows: [] };
  } catch (error) {
    console.error('Erro na query com parâmetros:', error);
    throw error;
  }
};

// Mock do getNeonClient para compatibilidade
export const getNeonClient = async () => {
  return {
    query: async (query: string, params?: any[]) => {
      if (params && params.length > 0) {
        return executeQueryWithParams(query, params);
      } else {
        return executeDirectQuery(query);
      }
    }
  };
};

export const closeNeonClient = async () => {
  // Não faz nada no frontend
};

// Funções de compatibilidade
export const executeNeonQuery = async (query: string, params?: any[]) => {
  const client = await getNeonClient();
  return client.query(query, params);
};

export const executeNeonRPC = async (functionName: string, params?: any) => {
  const client = await getNeonClient();
  return client.query(`SELECT * FROM ${functionName}()`, params ? Object.values(params) : []);
};

export const fetchPaginatedData = async (table: string, page: number, pageSize: number, orderBy: string, orderDirection: string) => {
  const client = await getNeonClient();
  const countResult = await client.query(`SELECT COUNT(*) FROM ${table}`);
  const total = parseInt(countResult.rows[0].count);
  
  const offset = (page - 1) * pageSize;
  const dataResult = await client.query(
    `SELECT * FROM ${table} ORDER BY ${orderBy} ${orderDirection} LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );
  
  return { data: dataResult.rows, total };
};

export const fetchAllData = async (table: string) => {
  const client = await getNeonClient();
  const result = await client.query(`SELECT * FROM ${table} ORDER BY date DESC`);
  return result.rows;
};

export default {
  getNeonClient,
  closeNeonClient,
  executeNeonQuery,
  executeNeonRPC,
  fetchPaginatedData,
  fetchAllData,
  executeDirectQuery
};