import React, { createContext, useContext, useMemo, useState } from "react";
import type { Payment, Transaction, CohortSummary, AffiliateSummary, Dataset } from "@/types/analytics";
import { parsePaymentsFile, parseTransactionsFile, computeAll } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
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

  const importTransactions = async (file: File) => {
    const rows = await parseTransactionsFile(file);
    const payload = rows.map((r) => ({
      customer_id: r.customer_id,
      date: r.date.toISOString(),
      ggr: r.ggr,
      chargeback: r.chargeback,
      deposit: r.deposit,
      withdrawal: r.withdrawal,
    }));

    const { error: delErr } = await supabase
      .from('transactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) console.error('Erro ao limpar transações:', delErr);

    const { error } = await supabase.from('transactions').insert(payload);
    if (error) {
      toast({ title: 'Erro ao salvar Transações', description: error.message });
      return;
    }
    setTransactions(rows);
    toast({ title: 'Transações importadas', description: `${rows.length} linhas salvas no banco.` });
  };

  const importPayments = async (file: File) => {
    const rows = await parsePaymentsFile(file);
    const payload = rows.map((r) => ({
      clientes_id: r.clientes_id,
      afiliados_id: r.afiliados_id,
      date: r.date.toISOString(),
      value: r.value,
      method: r.method,
      status: r.status,
      classification: r.classification,
      level: r.level,
    }));

    const { error: delErr } = await supabase
      .from('payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) console.error('Erro ao limpar pagamentos:', delErr);

    const { error } = await supabase.from('payments').insert(payload);
    if (error) {
      toast({ title: 'Erro ao salvar Pagamentos', description: error.message });
      return;
    }
    setPayments(rows);
    toast({ title: 'Pagamentos importados', description: `${rows.length} linhas salvas no banco.` });
  };
  React.useEffect(() => {
    // Carrega dados do Supabase ao iniciar
    const load = async () => {
      const [txRes, pyRes] = await Promise.all([
        supabase.from('transactions').select('*').order('date', { ascending: true }),
        supabase.from('payments').select('*').order('date', { ascending: true }),
      ]);

      if (txRes.error) console.error('Erro ao carregar transações:', txRes.error);
      if (pyRes.error) console.error('Erro ao carregar pagamentos:', pyRes.error);

      if (txRes.data) {
        setTransactions(
          txRes.data.map((t: any) => ({
            customer_id: t.customer_id,
            date: new Date(t.date),
            ggr: Number(t.ggr),
            chargeback: Number(t.chargeback),
            deposit: Number(t.deposit),
            withdrawal: Number(t.withdrawal),
          }))
        );
      }
      if (pyRes.data) {
        setPayments(
          pyRes.data.map((p: any) => ({
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
    };
    load();
  }, []);
  const reset = () => {
    void (async () => {
      setTransactions(null);
      setPayments(null);
      const [txDel, pyDel] = await Promise.all([
        supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      ]);
      if (txDel.error || pyDel.error) {
        toast({ title: 'Erro ao limpar dados', description: (txDel.error || pyDel.error)?.message ?? 'Verifique as políticas RLS.' });
      } else {
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
