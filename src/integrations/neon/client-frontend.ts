// Cliente Neon para o frontend - usa Supabase em vez de pg
import { supabase } from "@/integrations/supabase/client";

// Função para buscar dados paginados usando Supabase
export const fetchPaginatedData = async (table: string, page: number, pageSize: number, orderBy: string, orderDirection: string) => {
  try {
    // Validar direção de ordenação
    const validDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Buscar total de registros
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    const total = count || 0;
    
    // Buscar dados paginados
    const offset = (page - 1) * pageSize;
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderBy, { ascending: validDirection === 'ASC' })
      .range(offset, offset + pageSize - 1);
    
    if (error) throw error;
    
    return { data: data || [], total };
  } catch (error) {
    console.error('Erro ao buscar dados paginados:', error);
    return { data: [], total: 0 };
  }
};

// Função para executar RPC usando Supabase
export const executeNeonRPC = async (functionName: string, params?: any) => {
  try {
    const { data, error } = await supabase.rpc(functionName, params);
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Erro na RPC:', error);
    return [];
  }
};

// Função para buscar todos os dados usando Supabase
export const fetchAllData = async (table: string) => {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('Erro ao buscar todos os dados:', error);
    return [];
  }
};

// Funções mock para compatibilidade - não fazem nada no frontend
export const getNeonClient = async () => null;
export const closeNeonClient = async () => {};
export const executeNeonQuery = async () => [];

export default {
  getNeonClient,
  closeNeonClient,
  executeNeonQuery,
  executeNeonRPC,
  fetchPaginatedData,
  fetchAllData
};