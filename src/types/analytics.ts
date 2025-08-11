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
