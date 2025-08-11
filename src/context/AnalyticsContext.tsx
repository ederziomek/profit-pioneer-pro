import React, { createContext, useContext, useMemo, useState } from "react";
import type { Payment, Transaction, CohortSummary, AffiliateSummary, Dataset } from "@/types/analytics";
import { parsePaymentsFile, parseTransactionsFile, computeAll } from "@/lib/analytics";

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
    setTransactions(rows);
    localStorage.setItem("ig-tx", JSON.stringify(rows));
  };

  const importPayments = async (file: File) => {
    const rows = await parsePaymentsFile(file);
    setPayments(rows);
    localStorage.setItem("ig-pay", JSON.stringify(rows));
  };

  React.useEffect(() => {
    // restore from localStorage
    try {
      const tx = localStorage.getItem("ig-tx");
      const py = localStorage.getItem("ig-pay");
      if (tx) setTransactions(JSON.parse(tx));
      if (py) setPayments(JSON.parse(py));
    } catch {}
  }, []);

  const reset = () => {
    setTransactions(null);
    setPayments(null);
    localStorage.removeItem("ig-tx");
    localStorage.removeItem("ig-pay");
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
