// Cliente Neon para frontend - usa API real para conectar com o banco Neon
// Este arquivo é específico para o frontend e não depende de módulos Node.js

const API_BASE_URL = import.meta.env.VITE_API_URL || window.location.origin;

// Função para executar queries diretas via API
export const executeDirectQuery = async (query: string) => {
  try {
    if (query.includes('COUNT(*) as count FROM transactions')) {
      const response = await fetch(`${API_BASE_URL}/api/counts`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return { rows: [{ count: data.transactions.toString() }] };
    }
    
    if (query.includes('COUNT(*) as count FROM payments')) {
      const response = await fetch(`${API_BASE_URL}/api/counts`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return { rows: [{ count: data.payments.toString() }] };
    }
    
    if (query.includes('SELECT * FROM transactions')) {
      const response = await fetch(`${API_BASE_URL}/api/transactions`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return { rows: data };
    }
    
    if (query.includes('SELECT * FROM payments')) {
      const response = await fetch(`${API_BASE_URL}/api/payments`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return { rows: data };
    }
    
    if (query.includes('date_trunc')) {
      const response = await fetch(`${API_BASE_URL}/api/weeks`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      
      if (query.includes('transactions')) {
        return { rows: data.transactions.map((week: string) => ({ week_start: week })) };
      } else {
        return { rows: data.payments.map((week: string) => ({ week_start: week })) };
      }
    }
    
    console.log('Query não reconhecida:', query);
    return { rows: [] };
  } catch (error) {
    console.error('Erro na query direta:', error);
    throw error;
  }
};

// Função para executar queries com parâmetros via API
export const executeQueryWithParams = async (query: string, params: any[]) => {
  try {
    if (query.includes('INSERT INTO transactions')) {
      // Criar FormData para upload
      const formData = new FormData();
      
      // Simular arquivo para a API
      const csvContent = params.filter((_, i) => i % 6 === 0).map((_, index) => {
        const baseIndex = index * 6;
        return `${params[baseIndex + 1]},${params[baseIndex + 2]},${params[baseIndex + 3]},${params[baseIndex + 4]},${params[baseIndex + 5]},${params[baseIndex + 6]}`;
      }).join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      formData.append('file', blob, 'transactions.csv');
      
      const response = await fetch(`${API_BASE_URL}/api/import/transactions`, {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Erro ao importar transações');
      }
      
      return { rowCount: result.count };
    }
    
    if (query.includes('INSERT INTO payments')) {
      // Criar FormData para upload
      const formData = new FormData();
      
      // Simular arquivo para a API
      const csvContent = params.filter((_, i) => i % 9 === 0).map((_, index) => {
        const baseIndex = index * 9;
        return `${params[baseIndex + 1]},${params[baseIndex + 2]},${params[baseIndex + 3]},${params[baseIndex + 4]},${params[baseIndex + 5]},${params[baseIndex + 6]},${params[baseIndex + 7]},${params[baseIndex + 8]}`;
      }).join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      formData.append('file', blob, 'payments.csv');
      
      const response = await fetch(`${API_BASE_URL}/api/import/payments`, {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Erro ao importar pagamentos');
      }
      
      return { rowCount: result.count };
    }
    
    if (query.includes('DELETE FROM transactions')) {
      const response = await fetch(`${API_BASE_URL}/api/reset`, {
        method: 'POST',
      });
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Erro ao resetar dados');
      }
      
      return { rowCount: result.transactionsDeleted };
    }
    
    if (query.includes('DELETE FROM payments')) {
      const response = await fetch(`${API_BASE_URL}/api/reset`, {
        method: 'POST',
      });
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Erro ao resetar dados');
      }
      
      return { rowCount: result.paymentsDeleted };
    }
    
    if (query.includes('SELECT * FROM transactions ORDER BY date DESC LIMIT')) {
      const limit = params[0];
      const offset = params[1];
      const response = await fetch(`${API_BASE_URL}/api/transactions?limit=${limit}&offset=${offset}`);
      const data = await response.json();
      return { rows: data };
    }
    
    if (query.includes('SELECT * FROM payments ORDER BY date DESC LIMIT')) {
      const limit = params[0];
      const offset = params[1];
      const response = await fetch(`${API_BASE_URL}/api/payments?limit=${limit}&offset=${offset}`);
      const data = await response.json();
      return { rows: data };
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