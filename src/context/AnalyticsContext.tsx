import React, { createContext, useContext, useMemo, useState } from "react";
import type { Payment, Transaction, CohortSummary, AffiliateSummary, Dataset } from "@/types/analytics";
import { parsePaymentsFile, parseTransactionsFile, computeAll } from "@/lib/analytics";
import { getNeonClient } from "@/integrations/neon/client";
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

    const byKey = new Map<string, typeof payload[number]>();
    for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
    const records = Array.from(byKey.values());

    try {
      const client = await getNeonClient();
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

    const byKey = new Map<string, typeof payload[number]>();
    for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
    const records = Array.from(byKey.values());

    try {
      const client = await getNeonClient();
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
      
      await refresh();
      toast({ title: 'Pagamentos importados', description: `${records.length.toLocaleString()} linhas processadas (deduplicadas) no Neon.` });
    } catch (error) {
      console.error('Erro ao importar pagamentos para Neon:', error);
      toast({ title: 'Erro ao salvar Pagamentos', description: 'Erro ao conectar com o banco Neon.' });
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
