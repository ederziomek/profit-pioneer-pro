// Cliente Neon para frontend - usa fetch em vez de pg
// Este arquivo é específico para o frontend e não depende de módulos Node.js

// Configuração do Neon - usando variáveis definidas pelo Vite
const NEON_DATABASE_URL = (typeof __NEON_DATABASE_URL__ !== 'undefined' ? __NEON_DATABASE_URL__ : null) || 
  "postgresql://neondb_owner:npg_SjN6yxOIKnc1@ep-green-surf-adprt5l3-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// Função para executar queries via HTTP (simulando uma API)
export const executeNeonQuery = async (query: string, params?: any[]) => {
  try {
    // Por enquanto, vamos simular uma resposta vazia
    // Em produção, isso seria uma chamada para uma API backend
    console.warn('executeNeonQuery chamado no frontend - não implementado');
    return [];
  } catch (error) {
    console.error('Erro na query Neon:', error);
    throw error;
  }
};

// Função para executar RPC via HTTP
export const executeNeonRPC = async (functionName: string, params?: any) => {
  try {
    console.warn('executeNeonRPC chamado no frontend - não implementado');
    return [];
  } catch (error) {
    console.error('Erro na RPC Neon:', error);
    throw error;
  }
};

// Função para buscar dados paginados
export const fetchPaginatedData = async (table: string, page: number, pageSize: number, orderBy: string, orderDirection: string) => {
  try {
    console.warn('fetchPaginatedData chamado no frontend - não implementado');
    return { data: [], total: 0 };
  } catch (error) {
    console.error('Erro ao buscar dados paginados:', error);
    throw error;
  }
};

// Função para buscar todos os dados
export const fetchAllData = async (table: string) => {
  try {
    console.warn('fetchAllData chamado no frontend - não implementado');
    return [];
  } catch (error) {
    console.error('Erro ao buscar todos os dados:', error);
    throw error;
  }
};

// Função para executar queries diretas (usada no Database.tsx)
export const executeDirectQuery = async (query: string) => {
  try {
    console.warn('executeDirectQuery chamado no frontend - não implementado');
    return { rows: [] };
  } catch (error) {
    console.error('Erro na query direta:', error);
    throw error;
  }
};

// Mock do getNeonClient para compatibilidade
export const getNeonClient = async () => {
  return {
    query: executeDirectQuery
  };
};

export const closeNeonClient = async () => {
  // Não faz nada no frontend
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