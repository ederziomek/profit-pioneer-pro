import React, { createContext, useContext, useMemo, useState } from "react";
import type { Payment, Transaction, CohortSummary, AffiliateSummary, Dataset } from "@/types/analytics";
import { parsePaymentsFile, parseTransactionsFile, computeAll } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllData, fetchPaginatedData, executeNeonRPC, getNeonClient } from "@/integrations/neon/client-frontend";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";

interface AnalyticsContextType {
  dataset: Dataset | null;
  cohorts: CohortSummary[];
  affiliates: AffiliateSummary[];
  totals: {
    totalCustomers: number;
    cacTotal: number;
    ltvTotal: number;
    roi: number;
  } | null;
  suspicious: AffiliateSummary[];
  // Novas funções para paginação
  getPaginatedTransactions: (page: number, pageSize: number) => Promise<{ data: Transaction[]; total: number }>;
  getPaginatedPayments: (page: number, pageSize: number) => Promise<{ data: Payment[]; total: number }>;
  getPaginatedAffiliates: (page: number, pageSize: number, dateRange?: { start: Date; end: Date }) => Promise<{ data: any[]; total: number }>;
  importTransactions: (file: File) => Promise<void>;
  importPayments: (file: File) => Promise<void>;
  reset: () => void;
  refresh: () => Promise<void>;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export const AnalyticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);

  const dataset: Dataset | null = useMemo(() => {
    if (!transactions || !payments) return null;
    return { transactions, payments };
  }, [transactions, payments]);

  const { cohorts, affiliates, totals, suspicious } = useMemo(() => {
    if (!dataset) return { cohorts: [], affiliates: [], totals: null, suspicious: [] };
    return computeAll(dataset);
  }, [dataset]);

  // Função para buscar transações paginadas do Neon
  const getPaginatedTransactions = React.useCallback(async (page: number, pageSize: number) => {
    try {
      const { data, total } = await fetchPaginatedData<any>('transactions', page, pageSize, 'date', 'DESC');
      
      const formattedData = data.map((t: any) => ({
        customer_id: t.customer_id,
        date: new Date(t.date),
        ggr: Number(t.ggr),
        chargeback: Number(t.chargeback),
        deposit: Number(t.deposit),
        withdrawal: Number(t.withdrawal),
      }));

      return { data: formattedData, total };
    } catch (error) {
      console.error('Erro ao carregar transações do Neon:', error);
      return { data: [], total: 0 };
    }
  }, []);

  // Função para buscar pagamentos paginados do Neon
  const getPaginatedPayments = React.useCallback(async (page: number, pageSize: number) => {
    try {
      const { data, total } = await fetchPaginatedData<any>('payments', page, pageSize, 'date', 'DESC');
      
      const formattedData = data.map((p: any) => ({
        clientes_id: p.clientes_id,
        afiliados_id: p.afiliados_id,
        date: new Date(p.date),
        value: Number(p.value),
        method: p.method,
        status: p.status,
        classification: p.classification,
        level: Number(p.level),
      }));

      return { data: formattedData, total };
    } catch (error) {
      console.error('Erro ao carregar pagamentos do Neon:', error);
      return { data: [], total: 0 };
    }
  }, []);

  // Função para buscar afiliados paginados do Neon (usando RPC)
  const getPaginatedAffiliates = React.useCallback(async (page: number, pageSize: number, dateRange?: { start: Date; end: Date }) => {
    try {
      const data = await executeNeonRPC<any>('get_affiliates_paginated', {
        _page: page,
        _page_size: pageSize,
        _start_date: dateRange?.start?.toISOString() || null,
        _end_date: dateRange?.end?.toISOString() || null
      });

      if (!data || data.length === 0) {
        return { data: [], total: 0 };
      }

      // Extrair o total_count do primeiro resultado (todos têm o mesmo valor)
      const totalCount = data[0]?.total_count || 0;

      // Formatar os dados removendo o campo total_count
      const formattedData = data.map((item: any) => ({
        afiliados_id: item.afiliados_id,
        customers: Number(item.customers),
        ngr_total: Number(item.ngr_total),
        cpa_pago: Number(item.cpa_pago),
        rev_pago: Number(item.rev_pago),
        total_recebido: Number(item.total_recebido),
        roi: item.roi ? Number(item.roi) : null
      }));

      return { data: formattedData, total: totalCount };
    } catch (error) {
      console.error('Erro ao buscar afiliados paginados do Neon:', error);
      return { data: [], total: 0 };
    }
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      console.log('🔄 Carregando dados do Neon...');
      
      // Carregar TODOS os dados do Neon para o dashboard
      const [txData, pyData] = await Promise.all([
        fetchAllData<any>('transactions'),
        fetchAllData<any>('payments'),
      ]);

      console.log(`📊 Transações carregadas: ${txData.length}`);
      console.log(`📊 Pagamentos carregados: ${pyData.length}`);

      if (txData?.length) {
        setTransactions(
          txData.map((t: any) => ({
            customer_id: t.customer_id,
            date: new Date(t.date),
            ggr: Number(t.ggr),
            chargeback: Number(t.chargeback),
            deposit: Number(t.deposit),
            withdrawal: Number(t.withdrawal),
          }))
        );
      }
      
      if (pyData?.length) {
        setPayments(
          pyData.map((p: any) => ({
            clientes_id: p.clientes_id,
            afiliados_id: p.afiliados_id,
            date: new Date(p.date),
            value: Number(p.value),
            method: p.method,
            status: p.status,
            classification: p.classification,
            level: Number(p.level),
          }))
        );
      }

      console.log('✅ Dados carregados com sucesso do Neon!');
    } catch (error) {
      console.error('💥 Erro ao carregar dados do Neon:', error);
      toast({ 
        title: 'Erro ao carregar dados', 
        description: 'Não foi possível conectar ao banco Neon. Verifique a conexão.' 
      });
    }
  }, []);
  const importTransactions = async (file: File) => {
    const rows = await parseTransactionsFile(file);
    const payload = rows.map((r) => ({
      natural_key: `${r.customer_id}|${format(r.date, 'yyyy-MM-dd')}`,
      customer_id: r.customer_id,
      date: r.date.toISOString(),
      ggr: r.ggr,
      chargeback: r.chargeback,
      deposit: r.deposit,
      withdrawal: r.withdrawal,
    }));

    if (rows.length > 0) {
      const minDate = new Date(Math.min(...rows.map(r => r.date.getTime())));
      const maxDate = new Date(Math.max(...rows.map(r => r.date.getTime())));
      toast({ title: 'Prévia de Transações', description: `${rows.length} linhas (${format(minDate,'dd/MM/yyyy')} a ${format(maxDate,'dd/MM/yyyy')})` });
    } else {
      toast({ title: 'Nenhuma transação encontrada', description: 'Verifique a planilha (abas e colunas).' });
    }

    // Dedup e envio em lotes para evitar timeout no banco Neon
    const byKey = new Map<string, typeof payload[number]>();
    for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
    const records = Array.from(byKey.values());

    try {
      const client = await getNeonClient();
      const CHUNK = 1000;
      for (let i = 0; i < records.length; i += CHUNK) {
        const chunk = records.slice(i, i + CHUNK);
        
        // Usar INSERT ... ON CONFLICT para upsert no Neon
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
      
      await refresh();
      toast({ title: 'Transações importadas', description: `${records.length.toLocaleString()} linhas processadas (deduplicadas) no Neon.` });
    } catch (error) {
      console.error('Erro ao importar transações para Neon:', error);
      toast({ title: 'Erro ao salvar Transações', description: 'Erro ao conectar com o banco Neon.' });
    }
  };

  const importPayments = async (file: File) => {
    const rows = await parsePaymentsFile(file);
    const payload = rows.map((r) => ({
      natural_key: `${r.afiliados_id}|${(r.clientes_id ?? 'null')}|${format(r.date, 'yyyy-MM-dd')}|${r.method}|${r.value}`,
      clientes_id: r.clientes_id,
      afiliados_id: r.afiliados_id,
      date: r.date.toISOString(),
      value: r.value,
      method: r.method,
      status: r.status,
      classification: r.classification,
      level: r.level,
    }));

    if (rows.length > 0) {
      const minDate = new Date(Math.min(...rows.map(r => r.date.getTime())));
      const maxDate = new Date(Math.max(...rows.map(r => r.date.getTime())));
      toast({ title: 'Prévia de Pagamentos', description: `${rows.length} linhas (${format(minDate,'dd/MM/yyyy')} a ${format(maxDate,'dd/MM/yyyy')})` });
    } else {
      toast({ title: 'Nenhum pagamento encontrado', description: 'Verifique a planilha (abas e colunas: afiliado, data, valor, status, método).' });
    }

    // Dedup e envio em lotes para evitar timeout no banco Neon
    const byKey = new Map<string, typeof payload[number]>();
    for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
    const records = Array.from(byKey.values());

    try {
      const client = await getNeonClient();
      const CHUNK = 1000;
      for (let i = 0; i < records.length; i += CHUNK) {
        const chunk = records.slice(i, i + CHUNK);
        
        // Usar INSERT ... ON CONFLICT para upsert no Neon
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
      
      await refresh();
      toast({ title: 'Pagamentos importados', description: `${records.length.toLocaleString()} linhas processadas (deduplicadas) no Neon.` });
    } catch (error) {
      console.error('Erro ao importar pagamentos para Neon:', error);
      toast({ title: 'Erro ao salvar Pagamentos', description: 'Erro ao conectar com o banco Neon.' });
    }
  };
  React.useEffect(() => {
    // Carrega dados do Neon ao iniciar
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    // Recarrega quando o usuário autentica (evita dataset vazio ao abrir /auth)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh]);
  const reset = () => {
    void (async () => {
      setTransactions(null);
      setPayments(null);
      try {
        console.log('🔄 Iniciando limpeza do banco de dados...');
        
        // Limpar transações
        const { error: txError, count: txCount } = await supabase
          .from('transactions')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (txError) {
          console.error('Erro ao limpar transações:', txError);
          throw new Error(`Erro ao limpar transações: ${txError.message}`);
        }
        
        // Limpar pagamentos
        const { error: pyError, count: pyCount } = await supabase
          .from('payments')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (pyError) {
          console.error('Erro ao limpar pagamentos:', pyError);
          throw new Error(`Erro ao limpar pagamentos: ${pyError.message}`);
        }
        
        console.log(`✅ Limpeza concluída: ${txCount || 0} transações e ${pyCount || 0} pagamentos removidos`);
        
        await refresh();
        toast({ 
          title: 'Dados limpos com sucesso!', 
          description: `Banco de dados zerado. ${txCount || 0} transações e ${pyCount || 0} pagamentos removidos.` 
        });
      } catch (error) {
        console.error('Erro ao limpar dados:', error);
        toast({ 
          title: 'Erro ao limpar dados', 
          description: error instanceof Error ? error.message : 'Erro desconhecido ao conectar com o banco.' 
        });
      }
    })();
  };
  return (
    <AnalyticsContext.Provider value={{ dataset, cohorts, affiliates, totals, suspicious, getPaginatedTransactions, getPaginatedPayments, getPaginatedAffiliates, importTransactions, importPayments, reset, refresh }}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalytics = () => {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error("useAnalytics must be used within AnalyticsProvider");
  return ctx;
};
