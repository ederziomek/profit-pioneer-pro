import * as XLSX from "xlsx";
import { parse, startOfWeek } from "date-fns";
import type { Payment, Transaction, Dataset, CohortSummary, AffiliateSummary } from "@/types/analytics";

const parseDate = (v: any): Date => {
  if (v instanceof Date) return v;
  if (typeof v === "number") return XLSX.SSF.parse_date_code(v) ? new Date(Date.UTC(v, 0, 1)) : new Date(v);
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
    try { return parse(v, "dd/MM/yyyy", new Date()); } catch { return new Date(v); }
  }
  return new Date();
};

export async function parseTransactionsFile(file: File): Promise<Transaction[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null });
  return rows.map((r) => ({
    customer_id: String(r.customer_id ?? r.clientes_id ?? r.cliente_id ?? r["clientes_id"]).trim(),
    date: parseDate(r.date ?? r.data),
    ggr: Number(r.ggr ?? 0),
    chargeback: Number(r.chargeback ?? 0),
    deposit: Number(r.deposit ?? r.deposito ?? 0),
    withdrawal: Number(r.withdrawal ?? r.saque ?? 0),
  }));
}

export async function parsePaymentsFile(file: File): Promise<Payment[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets["pagamentos_cpa_rev"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null });
  return rows.map((r) => ({
    clientes_id: r.clientes_id ? String(r.clientes_id) : null,
    afiliados_id: String(r.afiliados_id ?? r.afiliado_id ?? r["afiliados_id"]).trim(),
    date: parseDate(r.date ?? r.data),
    value: Number(r.value ?? r.valor ?? 0),
    method: String(r.method ?? r.tipo ?? "").toLowerCase() as any,
    status: String(r.status ?? "").toLowerCase() as any,
    classification: String(r.classification ?? r.classificacao ?? "Jogador"),
    level: Number(r.level ?? r.nivel ?? 1),
  }));
}

export const getCohortWeek = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

const REV_PERCENT: Record<string, { total: number; nivel1: number; outros: number }> = {
  Jogador: { total: 0.05, nivel1: 0.01, outros: 0.01 },
  Iniciante: { total: 0.1, nivel1: 0.06, outros: 0.01 },
  Regular: { total: 0.2, nivel1: 0.12, outros: 0.02 },
  Profissional: { total: 0.3, nivel1: 0.18, outros: 0.03 },
  Elite: { total: 0.4, nivel1: 0.24, outros: 0.04 },
  Expert: { total: 0.5, nivel1: 0.3, outros: 0.05 },
  Mestre: { total: 0.6, nivel1: 0.36, outros: 0.06 },
  Lendário: { total: 0.7, nivel1: 0.42, outros: 0.07 },
};

export function computeAll(dataset: Dataset) {
  const { transactions: txRaw, payments: pyRaw } = dataset;
  // Normalize dates from potential JSON restore
  const transactions = txRaw.map((t) => ({ ...t, date: new Date(t.date as any) }));
  const payments = pyRaw.map((p) => ({ ...p, date: new Date(p.date as any) }));

  // NGR por cliente
  const ngrByCustomer = new Map<string, number>();
  transactions.forEach((t) => {
    const ngr = (t.ggr - t.chargeback) * 0.8;
    ngrByCustomer.set(t.customer_id, (ngrByCustomer.get(t.customer_id) ?? 0) + ngr);
  });

  // Primeiro CPA do cliente (cohort) e último CPA (mapeamento atual)
  const paymentsOk = payments.filter((p) => p.status === "finish");
  const cpaPayments = paymentsOk.filter((p) => p.method === "cpa" && p.clientes_id);

  const firstCpaDateByCustomer = new Map<string, Date>();
  const latestCpaByCustomer = new Map<string, Payment>();
  cpaPayments.forEach((p) => {
    const cid = p.clientes_id!;
    if (!firstCpaDateByCustomer.has(cid) || firstCpaDateByCustomer.get(cid)!.getTime() > p.date.getTime()) {
      firstCpaDateByCustomer.set(cid, p.date);
    }
    const prev = latestCpaByCustomer.get(cid);
    if (!prev || prev.date.getTime() < p.date.getTime()) {
      latestCpaByCustomer.set(cid, p);
    }
  });

  // REV calculado por cliente com base na classificação do afiliado
  const revByCustomer = new Map<string, number>();
  latestCpaByCustomer.forEach((pay, cid) => {
    const ngr = ngrByCustomer.get(cid) ?? 0;
    const perc = REV_PERCENT[pay.classification] ?? REV_PERCENT.Jogador;
    const rev = ngr * perc.total;
    revByCustomer.set(cid, rev);
  });

  // Agregado por afiliado para sistema de memória
  const aggByAffiliate: Map<string, { ngr: number; cpa: number; rev: number; customers: Set<string>; rejectedRate: number; payments: { total: number; rejected: number } }> = new Map();

  // CPA total por afiliado
  payments.forEach((p) => {
    const a = aggByAffiliate.get(p.afiliados_id) ?? { ngr: 0, cpa: 0, rev: 0, customers: new Set<string>(), rejectedRate: 0, payments: { total: 0, rejected: 0 } };
    a.payments.total += 1;
    if (p.status === "rejected") a.payments.rejected += 1;
    if (p.method === "cpa" && p.status === "finish") {
      a.cpa += p.value;
      if (p.clientes_id) a.customers.add(p.clientes_id);
    }
    aggByAffiliate.set(p.afiliados_id, a);
  });

  // Distribuir NGR e REV por afiliado via cliente mapeado
  latestCpaByCustomer.forEach((pay, cid) => {
    const ngr = ngrByCustomer.get(cid) ?? 0;
    const rev = revByCustomer.get(cid) ?? 0;
    const a = aggByAffiliate.get(pay.afiliados_id)!;
    a.ngr += ngr;
    a.rev += rev;
  });

  // Aplicar sistema de memória: zera REV se base deficitária
  aggByAffiliate.forEach((a) => {
    a.rejectedRate = a.payments.total ? a.payments.rejected / a.payments.total : 0;
    const lucroBase = a.ngr - a.cpa - a.rev;
    if (lucroBase < 0) {
      a.rev = 0;
    }
  });

  // Cohorts por semana do primeiro CPA
  const cohortsMap = new Map<number, CohortSummary>();
  firstCpaDateByCustomer.forEach((d, cid) => {
    const wk = getCohortWeek(d).getTime();
    const ngr = ngrByCustomer.get(cid) ?? 0;
    const rev = revByCustomer.get(cid) ?? 0;
    const cpa = cpaPayments.filter((p) => p.clientes_id === cid).reduce((s, p) => s + p.value, 0);
    const item = cohortsMap.get(wk) ?? { weekStart: getCohortWeek(d), customers: 0, cac_cpa: 0, cac_rev: 0, cac_total: 0, ltv_total: 0, roi: 0 };
    item.customers += 1;
    item.cac_cpa += cpa;
    item.cac_rev += rev; // usando rev calculado
    item.cac_total = item.cac_cpa + item.cac_rev;
    item.ltv_total += ngr;
    item.roi = item.cac_total > 0 ? (item.ltv_total - item.cac_total) / item.cac_total : 0;
    cohortsMap.set(wk, item);
  });

  const cohorts: CohortSummary[] = Array.from(cohortsMap.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

  // Afiliados resumo + score de suspeita
  const affiliates: AffiliateSummary[] = [];
  aggByAffiliate.forEach((v, afiliados_id) => {
    const roi = (v.cpa + v.rev) > 0 ? (v.ngr - v.cpa - v.rev) / (v.cpa + v.rev) : 0;
    const ltvPorCliente = v.customers.size ? v.ngr / v.customers.size : 0;
    const taxaInatividade = v.customers.size ? (v.customers.size - Array.from(v.customers).filter((cid) => (ngrByCustomer.get(cid) ?? 0) > 0).length) / v.customers.size : 0;

    let score = 0;
    if (v.rejectedRate > 0.2) score += 30;
    if (roi < -0.5) score += 25;
    if (ltvPorCliente < 50) score += 25;
    if (taxaInatividade > 0.8) score += 20;
    if (score > 100) score = 100;

    affiliates.push({ afiliados_id, customers: v.customers.size, ngr_total: v.ngr, cpa_total: v.cpa, rev_calculado: v.rev, total_recebido: v.cpa + v.rev, roi, score, rejectedRate: v.rejectedRate });
  });

  affiliates.sort((a, b) => b.ngr_total - a.ngr_total);

  // Totais gerais
  const totalCustomers = new Set<string>(transactions.map((t) => t.customer_id)).size;
  const cac_cpa_total = cpaPayments.reduce((s, p) => s + p.value, 0);
  const ltv_total = Array.from(ngrByCustomer.values()).reduce((s, v) => s + v, 0);
  const rev_total = affiliates.reduce((s, a) => s + a.rev_calculado, 0);
  const cac_total = cac_cpa_total + rev_total;
  const roi = cac_total > 0 ? (ltv_total - cac_total) / cac_total : 0;

  const totals = { totalCustomers, cacTotal: cac_total, ltvTotal: ltv_total, roi };

  const suspicious = affiliates.filter((a) => a.score >= 51).sort((a, b) => b.score - a.score).slice(0, 20);

  return { cohorts, affiliates, totals, suspicious };
}
