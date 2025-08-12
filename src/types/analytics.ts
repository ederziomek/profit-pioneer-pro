export type Method = "cpa" | "rev";
export type Status = "finish" | "rejected" | string;

export interface Transaction {
  customer_id: string;
  date: Date;
  ggr: number;
  chargeback: number;
  deposit: number;
  withdrawal: number;
}

export interface Payment {
  clientes_id: string | null;
  afiliados_id: string;
  date: Date;
  value: number;
  method: Method;
  status: Status;
  classification: string; // Jogador, Iniciante, etc.
  level: number; // 1-5
}

export interface Dataset {
  transactions: Transaction[];
  payments: Payment[];
}

export interface CohortSummary {
  weekStart: Date;
  customers: number;
  cac_cpa: number;
  cac_rev: number;
  cac_total: number;
  ltv_total: number;
  roi: number; // 0-1
}

export interface AffiliateSummary {
  afiliados_id: string;
  customers: number;
  ngr_total: number;
  cpa_total: number;
  rev_calculado: number;
  total_recebido: number;
  roi: number; // 0-1
  score: number; // 0-100
  rejectedRate: number; // 0-1
}

// Extended Cohort summary for day/week/month with payments and profitability details
export type CohortGranularity = "day" | "week" | "month";

export interface CohortSummaryV2 {
  granularity: CohortGranularity;
  periodStart: Date; // start of day/week/month in America/Sao_Paulo
  customers: number;
  deposits: number;
  withdrawals: number;
  ggr: number;
  chargeback: number;
  ngr_total: number; // (ggr - chargeback) * 0.8
  cpa_pago: number; // payments method=cpa, status=finish in [anchor, today]
  rev_pago: number; // payments method=rev, status=finish in [anchor, today]
  pago_total: number; // cpa_pago + rev_pago
  ltv_total: number; // = ngr_total
  lucro: number; // ngr_total - pago_total
  roi: number | null; // null => display "—"
  tempo: number; // elapsed units since periodStart (days/weeks/months)
  breakeven_periods?: number | null; // first period index where cumulative NGR >= cumulative Paid
}

export interface AffiliatePaidSummary {
  afiliados_id: string;
  customers: number;
  ngr_total: number;
  cpa_pago: number;
  rev_pago: number;
  total_recebido: number;
  roi: number | null;
}
