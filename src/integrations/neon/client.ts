import { Client } from 'pg';

// Configuração do Neon
const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL || 
  "postgresql://neondb_owner:npg_SjN6yxOIKnc1@ep-green-surf-adprt5l3-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// Cliente Neon singleton
let neonClient: Client | null = null;

export const getNeonClient = async (): Promise<Client> => {
  if (!neonClient) {
    neonClient = new Client({ connectionString: NEON_DATABASE_URL });
    await neonClient.connect();
  }
  return neonClient;
};

export const closeNeonClient = async () => {
  if (neonClient) {
    await neonClient.end();
    neonClient = null;
  }
};

// Função para executar queries no Neon
export const executeNeonQuery = async (query: string, params?: any[]): Promise<any[]> => {
  const client = await getNeonClient();
  try {
    const result = await client.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Erro na query Neon:', error);
    throw error;
  }
};

// Função para executar RPC no Neon
export const executeNeonRPC = async (functionName: string, params?: any): Promise<any[]> => {
  const client = await getNeonClient();
  try {
    // Construir a query RPC
    let query = `SELECT * FROM ${functionName}(`;
    if (params) {
      const paramPlaceholders = Object.keys(params).map((_, i) => `$${i + 1}`).join(', ');
      query += paramPlaceholders;
    }
    query += ')';
    
    const result = await client.query(query, params ? Object.values(params) : []);
    return result.rows;
  } catch (error) {
    console.error('Erro na RPC Neon:', error);
    throw error;
  }
};

// Função para buscar dados paginados
export const fetchPaginatedData = async (table: string, page: number, pageSize: number, orderBy: string, orderDirection: string): Promise<{ data: any[]; total: number }> {
  const client = await getNeonClient();
  try {
    // Validar direção de ordenação
    const validDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Buscar total de registros
    const countResult = await client.query(`SELECT COUNT(*) FROM ${table}`);
    const total = parseInt(countResult.rows[0].count);
    
    // Buscar dados paginados
    const offset = (page - 1) * pageSize;
    const dataResult = await client.query(
      `SELECT * FROM ${table} ORDER BY ${orderBy} ${validDirection} LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );
    
    return { data: dataResult.rows, total };
  } catch (error) {
    console.error('Erro ao buscar dados paginados:', error);
    throw error;
  }
};

// Função para buscar todos os dados (para dashboard)
export const fetchAllData = async (table: string): Promise<any[]> => {
  const client = await getNeonClient();
  try {
    const result = await client.query(`SELECT * FROM ${table} ORDER BY date DESC`);
    return result.rows;
  } catch (error) {
    console.error('Erro ao buscar todos os dados:', error);
    throw error;
  }
};

export default {
  getNeonClient,
  closeNeonClient,
  executeNeonQuery,
  executeNeonRPC,
  fetchPaginatedData,
  fetchAllData
};