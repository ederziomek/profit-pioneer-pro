import React, { createContext, useContext, useMemo, useState } from "react";
import type { Payment, Transaction, CohortSummary, AffiliateSummary, Dataset } from "@/types/analytics";
import { parsePaymentsFile, parseTransactionsFile, computeAll } from "@/lib/analytics";
import { getNeonClient } from "@/integrations/neon/client-frontend";
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

  const getPaginatedTransactions = React.useCallback(async (page: number, pageSize: number) => {
    try {
      const client = await getNeonClient();
      
      const countResult = await client.query('SELECT COUNT(*) FROM transactions');
      const total = parseInt(countResult.rows[0].count);
      
      const offset = (page - 1) * pageSize;
      const dataResult = await client.query(
        'SELECT * FROM transactions ORDER BY date DESC LIMIT $1 OFFSET $2',
        [pageSize, offset]
      );
      
      const formattedData = dataResult.rows.map((t: any) => ({
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

  const getPaginatedPayments = React.useCallback(async (page: number, pageSize: number) => {
    try {
      const client = await getNeonClient();
      
      const countResult = await client.query('SELECT COUNT(*) FROM payments');
      const total = parseInt(countResult.rows[0].count);
      
      const offset = (page - 1) * pageSize;
      const dataResult = await client.query(
        'SELECT * FROM payments ORDER BY date DESC LIMIT $1 OFFSET $2',
        [pageSize, offset]
      );
      
      const formattedData = dataResult.rows.map((p: any) => ({
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

  const getPaginatedAffiliates = React.useCallback(async (page: number, pageSize: number, dateRange?: { start: Date; end: Date }) => {
    try {
      const client = await getNeonClient();
      
      let query = `
        SELECT 
          p.afiliados_id,
          COUNT(DISTINCT p.clientes_id) FILTER (WHERE p.clientes_id IS NOT NULL) as customers,
          SUM(p.value) FILTER (WHERE p.method = 'cpa' AND p.status = 'finish') as cpa_pago,
          SUM(p.value) FILTER (WHERE p.method = 'rev' AND p.status = 'finish') as rev_pago,
          SUM(p.value) FILTER (WHERE p.status = 'finish') as total_recebido,
          COUNT(*) as total_count
        FROM payments p
      `;
      
      const params: any[] = [];
      if (dateRange) {
        query += ' WHERE p.date BETWEEN $1 AND $2';
        params.push(dateRange.start.toISOString(), dateRange.end.toISOString());
      }
      
      query += `
        GROUP BY p.afiliados_id
        ORDER BY total_recebido DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      
      params.push(pageSize, (page - 1) * pageSize);
      
      const result = await client.query(query, params);
      
      if (!result.rows || result.rows.length === 0) {
        return { data: [], total: 0 };
      }

      let countQuery = 'SELECT COUNT(DISTINCT afiliados_id) FROM payments';
      if (dateRange) {
        countQuery += ' WHERE date BETWEEN $1 AND $2';
        const countResult = await client.query(countQuery, [dateRange.start.toISOString(), dateRange.end.toISOString()]);
        const totalCount = parseInt(countResult.rows[0].count);
        
        const formattedData = result.rows.map((item: any) => ({
          afiliados_id: item.afiliados_id,
          customers: Number(item.customers),
          ngr_total: 0,
          cpa_pago: Number(item.cpa_pago),
          rev_pago: Number(item.rev_pago),
          total_recebido: Number(item.total_recebido),
          roi: item.total_recebido > 0 ? (Number(item.rev_pago) / Number(item.cpa_pago)) : null
        }));

        return { data: formattedData, total: totalCount };
      } else {
        const countResult = await client.query(countQuery);
        const totalCount = parseInt(countResult.rows[0].count);
        
        const formattedData = result.rows.map((item: any) => ({
          afiliados_id: item.afiliados_id,
          customers: Number(item.customers),
          ngr_total: 0,
          cpa_pago: Number(item.cpa_pago),
          rev_pago: Number(item.rev_pago),
          total_recebido: Number(item.total_recebido),
          roi: item.total_recebido > 0 ? (Number(item.rev_pago) / Number(item.cpa_pago)) : null
        }));

        return { data: formattedData, total: totalCount };
      }
    } catch (error) {
      console.error('Erro ao buscar afiliados paginados do Neon:', error);
      return { data: [], total: 0 };
    }
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      console.log('Carregando dados do Neon...');
      
      const client = await getNeonClient();
      
      const [txData, pyData] = await Promise.all([
        client.query('SELECT * FROM transactions ORDER BY date DESC'),
        client.query('SELECT * FROM payments ORDER BY date DESC'),
      ]);

      console.log(`Transações carregadas: ${txData.rows.length}`);
      console.log(`Pagamentos carregados: ${pyData.rows.length}`);

      if (txData?.rows?.length) {
        setTransactions(
          txData.rows.map((t: any) => ({
            customer_id: t.customer_id,
            date: new Date(t.date),
            ggr: Number(t.ggr),
            chargeback: Number(t.chargeback),
            deposit: Number(t.deposit),
            withdrawal: Number(t.withdrawal),
          }))
        );
      }
      
      if (pyData?.rows?.length) {
        setPayments(
          pyData.rows.map((p: any) => ({
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

      console.log('Dados carregados com sucesso do Neon!');
    } catch (error) {
      console.error('Erro ao carregar dados do Neon:', error);
      toast({ 
        title: 'Erro ao carregar dados', 
        description: 'Não foi possível conectar ao banco Neon. Verifique a conexão.' 
      });
    }
  }, []);

  const importTransactions = async (file: File) => {
    try {
      console.log('📁 Iniciando importação de transações:', file.name, file.size);
      
      // Criar FormData para enviar o arquivo
      const formData = new FormData();
      formData.append('file', file);
      
      // Fazer upload para a API
      const response = await fetch('/api/import/transactions', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      console.log('✅ Resultado da importação:', result);
      
      // Atualizar contadores e dados
      await refresh();
      
      toast({ 
        title: 'Transações importadas com sucesso!', 
        description: `${result.total} transações processadas (${result.inserted} inseridas, ${result.updated} atualizadas)` 
      });
      
    } catch (error) {
      console.error('❌ Erro ao importar transações:', error);
      toast({ 
        title: 'Erro ao importar transações', 
        description: error instanceof Error ? error.message : 'Erro desconhecido' 
      });
    }
  };

  const importPayments = async (file: File) => {
    try {
      console.log('📁 Iniciando importação de pagamentos:', file.name, file.size);
      
      // Criar FormData para enviar o arquivo
      const formData = new FormData();
      formData.append('file', file);
      
      // Fazer upload para a API
      const response = await fetch('/api/import/payments', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      console.log('✅ Resultado da importação:', result);
      
      // Atualizar contadores e dados
      await refresh();
      
      toast({ 
        title: 'Pagamentos importados com sucesso!', 
        description: `${result.total} pagamentos processados (${result.inserted} inseridos, ${result.updated} atualizados)` 
      });
      
    } catch (error) {
      console.error('❌ Erro ao importar pagamentos:', error);
      toast({ 
        title: 'Erro ao importar pagamentos', 
        description: error instanceof Error ? error.message : 'Erro desconhecido' 
      });
    }
  };

  const reset = () => {
    void (async () => {
      setTransactions(null);
      setPayments(null);
      try {
        console.log('Iniciando limpeza do banco de dados...');
        
        const client = await getNeonClient();
        
        const txResult = await client.query('DELETE FROM transactions');
        console.log(`Transacoes removidas: ${txResult.rowCount}`);
        
        const pyResult = await client.query('DELETE FROM payments');
        console.log(`Pagamentos removidos: ${pyResult.rowCount}`);
        
        console.log(`Limpeza concluida: ${txResult.rowCount} transacoes e ${pyResult.rowCount} pagamentos removidos`);
        
        await refresh();
        toast({ 
          title: 'Dados limpos com sucesso!', 
          description: `Banco de dados zerado. ${txResult.rowCount} transacoes e ${pyResult.rowCount} pagamentos removidos.` 
        });
      } catch (error) {
        console.error('Erro ao limpar dados:', error);
        toast({ 
          title: 'Erro ao limpar dados', 
          description: error instanceof Error ? error.message : 'Erro desconhecido ao conectar com o banco Neon.' 
        });
      }
    })();
  };

  React.useEffect(() => {
    refresh();
  }, [refresh]);

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
