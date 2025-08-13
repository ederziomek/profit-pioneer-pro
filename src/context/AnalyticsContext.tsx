import React, { createContext, useContext, useMemo, useState } from "react";
import type { Payment, Transaction, CohortSummary, AffiliateSummary, Dataset } from "@/types/analytics";
import { parsePaymentsFile, parseTransactionsFile, computeAll } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
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
  importTransactions: (file: File) => Promise<void>;
  importPayments: (file: File) => Promise<void>;
  reset: () => void;
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

  const refresh = React.useCallback(async () => {
    // Paginate to load ALL rows (PostgREST has default 1,000 row limit)
    const PAGE = 20000;

    const fetchAll = async (table: 'transactions' | 'payments') => {
      const results: any[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .order('date', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) {
          console.error(`Erro ao carregar ${table}:`, error);
          break;
        }
        const len = data?.length ?? 0;
        if (!len) break;
        results.push(...(data as any[]));
        if (len < PAGE) break;
        from += PAGE;
      }
      return results;
    };

    const [txData, pyData] = await Promise.all([
      fetchAll('transactions'),
      fetchAll('payments'),
    ]);

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

    // Dedup e envio em lotes para evitar timeout no banco
    const byKey = new Map<string, typeof payload[number]>();
    for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
    const records = Array.from(byKey.values());

    const CHUNK = 1000;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('transactions')
        .upsert(chunk, { onConflict: 'natural_key', ignoreDuplicates: true });
      if (error) {
        toast({ title: 'Erro ao salvar Transações', description: error.message });
        return;
      }
    }

    await refresh();
    toast({ title: 'Transações importadas', description: `${records.length.toLocaleString()} linhas processadas (deduplicadas).` });
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

    // Dedup e envio em lotes para evitar timeout
    const byKey = new Map<string, typeof payload[number]>();
    for (const p of payload) if (!byKey.has(p.natural_key)) byKey.set(p.natural_key, p);
    const records = Array.from(byKey.values());

    const CHUNK = 1000;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('payments')
        .upsert(chunk, { onConflict: 'natural_key', ignoreDuplicates: true });
      if (error) {
        toast({ title: 'Erro ao salvar Pagamentos', description: error.message });
        return;
      }
    }

    await refresh();
    toast({ title: 'Pagamentos importados', description: `${records.length.toLocaleString()} linhas processadas (deduplicadas).` });
  };
  React.useEffect(() => {
    // Carrega dados do Supabase ao iniciar
    refresh();
  }, [refresh]);
  const reset = () => {
    void (async () => {
      setTransactions(null);
      setPayments(null);
      const { error } = await supabase.rpc('admin_reset_data');
      if (error) {
        toast({ title: 'Erro ao limpar dados', description: error.message });
      } else {
        await refresh();
        toast({ title: 'Dados limpos', description: 'As tabelas foram esvaziadas.' });
      }
    })();
  };
  return (
    <AnalyticsContext.Provider value={{ dataset, cohorts, affiliates, totals, suspicious, importTransactions, importPayments, reset }}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalytics = () => {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error("useAnalytics must be used within AnalyticsProvider");
  return ctx;
};
