import * as XLSX from "xlsx";
import { parse, startOfWeek, startOfDay, startOfMonth, differenceInDays, differenceInWeeks, differenceInMonths, isWithinInterval, addDays, addWeeks, addMonths } from "date-fns";
import type { Payment, Transaction, Dataset, CohortSummary, AffiliateSummary, CohortSummaryV2, CohortGranularity } from "@/types/analytics";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

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

// ================= Cohorts V2 (anchor = first transaction) =================
export type { CohortSummaryV2, CohortGranularity } from "@/types/analytics";

const TZ = "America/Sao_Paulo";

const startOfDayTZ = (d: Date) => fromZonedTime(startOfDay(toZonedTime(d, TZ)), TZ);
const startOfWeekTZ = (d: Date) => fromZonedTime(startOfWeek(toZonedTime(d, TZ), { weekStartsOn: 1 }), TZ);
const startOfMonthTZ = (d: Date) => fromZonedTime(startOfMonth(toZonedTime(d, TZ)), TZ);

const periodStartFor = (d: Date, granularity: CohortGranularity) => {
  switch (granularity) {
    case "day":
      return startOfDayTZ(d);
    case "week":
      return startOfWeekTZ(d);
    case "month":
      return startOfMonthTZ(d);
  }
};

export function computeCohortsV2(dataset: Dataset, granularity: CohortGranularity) {
  const { transactions: txRaw, payments: pyRaw } = dataset;
  const tx = txRaw.map((t) => ({ ...t, date: new Date(t.date as any) }));
  const py = pyRaw.map((p) => ({ ...p, date: new Date(p.date as any) }));

  // First transaction (anchor) per customer
  const anchorByCustomer = new Map<string, Date>();
  tx.forEach((t) => {
    const prev = anchorByCustomer.get(t.customer_id);
    if (!prev || t.date.getTime() < prev.getTime()) anchorByCustomer.set(t.customer_id, t.date);
  });

  // Aggregate transactions per customer (from anchor -> today)
  const aggTxByCustomer = new Map<string, { deposits: number; withdrawals: number; ggr: number; chargeback: number; ngr: number }>();
  const today = new Date();
  tx.forEach((t) => {
    const anchor = anchorByCustomer.get(t.customer_id);
    if (!anchor) return;
    if (t.date.getTime() < anchor.getTime() || t.date.getTime() > today.getTime()) return;
    const a = aggTxByCustomer.get(t.customer_id) ?? { deposits: 0, withdrawals: 0, ggr: 0, chargeback: 0, ngr: 0 };
    a.deposits += t.deposit;
    a.withdrawals += t.withdrawal;
    a.ggr += t.ggr;
    a.chargeback += t.chargeback;
    a.ngr += (t.ggr - t.chargeback) * 0.8;
    aggTxByCustomer.set(t.customer_id, a);
  });

  // Payments per customer (finish) within [anchor, today]
  const cpaByCustomer = new Map<string, number>();
  const revByCustomer = new Map<string, number>();
  py.forEach((p) => {
    if (p.status !== "finish" || !p.clientes_id) return;
    const anchor = anchorByCustomer.get(p.clientes_id);
    if (!anchor) return;
    if (p.date.getTime() < anchor.getTime() || p.date.getTime() > today.getTime()) return;
    if (p.method === "cpa") cpaByCustomer.set(p.clientes_id, (cpaByCustomer.get(p.clientes_id) ?? 0) + p.value);
    if (p.method === "rev") revByCustomer.set(p.clientes_id, (revByCustomer.get(p.clientes_id) ?? 0) + p.value);
  });

  // Group by period start
  type Row = ReturnType<typeof buildEmptyRow>;
  const map = new Map<number, Row>();

  function buildEmptyRow(periodStart: Date) {
    return {
      granularity,
      periodStart,
      customers: 0,
      deposits: 0,
      withdrawals: 0,
      ggr: 0,
      chargeback: 0,
      ngr_total: 0,
      cpa_pago: 0,
      rev_pago: 0,
      pago_total: 0,
      ltv_total: 0,
      lucro: 0,
      roi: null as number | null,
      tempo: 0,
      breakeven_periods: null as number | null,
    };
  }

  anchorByCustomer.forEach((anchor, cid) => {
    const periodStart = periodStartFor(anchor, granularity);
    const key = periodStart.getTime();
    const row = map.get(key) ?? buildEmptyRow(periodStart);
    row.customers += 1;

    const agg = aggTxByCustomer.get(cid) ?? { deposits: 0, withdrawals: 0, ggr: 0, chargeback: 0, ngr: 0 };
    row.deposits += agg.deposits;
    row.withdrawals += agg.withdrawals;
    row.ggr += agg.ggr;
    row.chargeback += agg.chargeback;
    row.ngr_total += agg.ngr;

    const cpa = cpaByCustomer.get(cid) ?? 0;
    const rev = revByCustomer.get(cid) ?? 0;
    row.cpa_pago += cpa;
    row.rev_pago += rev;
    row.pago_total += cpa + rev;
    row.ltv_total += agg.ngr;
    row.lucro += agg.ngr - (cpa + rev);

    map.set(key, row);
  });

  // Finalize rows: ROI and tempo
  const todayTZ = startOfDayTZ(today);
  const rows = Array.from(map.values()).map((r) => {
    const psTZ = r.periodStart; // already in UTC representing TZ boundary
    if (r.pago_total > 0) r.roi = r.ngr_total / r.pago_total - 1;
    else r.roi = null;
    if (granularity === "day") r.tempo = Math.max(0, differenceInDays(toZonedTime(todayTZ, TZ), toZonedTime(psTZ, TZ)));
    if (granularity === "week") r.tempo = Math.max(0, differenceInWeeks(toZonedTime(todayTZ, TZ), toZonedTime(psTZ, TZ)));
    if (granularity === "month") r.tempo = Math.max(0, differenceInMonths(toZonedTime(todayTZ, TZ), toZonedTime(psTZ, TZ)));
    return r;
  });

  rows.sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
  return rows;
}

// ================ Affiliates totals with optional activity filter ================
import type { AffiliatePaidSummary } from "@/types/analytics";

export function computeAffiliatesPaid(dataset: Dataset, dateRange?: { start: Date; end: Date }): AffiliatePaidSummary[] {
  const { transactions: txRaw, payments: pyRaw } = dataset;
  const tx = txRaw.map((t) => ({ ...t, date: new Date(t.date as any) }));
  const py = pyRaw.map((p) => ({ ...p, date: new Date(p.date as any) }));

  // NGR per customer
  const ngrByCustomer = new Map<string, number>();
  tx.forEach((t) => {
    const ngr = (t.ggr - t.chargeback) * 0.8;
    ngrByCustomer.set(t.customer_id, (ngrByCustomer.get(t.customer_id) ?? 0) + ngr);
  });

  // Attribute customer to latest CPA finish
  const latestCpaByCustomer = new Map<string, Payment>();
  py.forEach((p) => {
    if (p.status === "finish" && p.method === "cpa" && p.clientes_id) {
      const prev = latestCpaByCustomer.get(p.clientes_id);
      if (!prev || prev.date.getTime() < p.date.getTime()) latestCpaByCustomer.set(p.clientes_id, p);
    }
  });

  // Aggregate per affiliate totals (anchor->today)
  type Agg = { customers: Set<string>; ngr: number; cpa: number; rev: number };
  const aggByAffiliate = new Map<string, Agg>();

  // Initialize customer sets by attribution
  latestCpaByCustomer.forEach((pay, cid) => {
    const a = aggByAffiliate.get(pay.afiliados_id) ?? { customers: new Set<string>(), ngr: 0, cpa: 0, rev: 0 };
    a.customers.add(cid);
    a.ngr += ngrByCustomer.get(cid) ?? 0;
    aggByAffiliate.set(pay.afiliados_id, a);
  });

  // Sum payments finish by affiliate
  py.forEach((p) => {
    if (p.status !== "finish") return;
    const a = aggByAffiliate.get(p.afiliados_id) ?? { customers: new Set<string>(), ngr: 0, cpa: 0, rev: 0 };
    if (p.method === "cpa") a.cpa += p.value;
    if (p.method === "rev") a.rev += p.value;
    aggByAffiliate.set(p.afiliados_id, a);
  });

  // Optional date filter: show affiliates with activity in interval only
  let allowed: Set<string> | null = null;
  if (dateRange) {
    const { start, end } = dateRange;
    const hasActivity = new Set<string>();

    // Payments activity
    py.forEach((p) => {
      if (p.date >= start && p.date <= end) hasActivity.add(p.afiliados_id);
    });

    // Transactions activity by attributed customers
    const affByCustomer = new Map<string, string>();
    latestCpaByCustomer.forEach((p, cid) => affByCustomer.set(cid, p.afiliados_id));
    tx.forEach((t) => {
      if (t.date >= start && t.date <= end) {
        const aff = affByCustomer.get(t.customer_id);
        if (aff) hasActivity.add(aff);
      }
    });

    allowed = hasActivity;
  }

  const result: AffiliatePaidSummary[] = [];
  aggByAffiliate.forEach((v, afiliados_id) => {
    if (allowed && !allowed.has(afiliados_id)) return;
    const total_recebido = v.cpa + v.rev;
    const roi = total_recebido > 0 ? v.ngr / total_recebido - 1 : null;
    result.push({ afiliados_id, customers: v.customers.size, ngr_total: v.ngr, cpa_pago: v.cpa, rev_pago: v.rev, total_recebido, roi });
  });

  result.sort((a, b) => b.ngr_total - a.ngr_total);
  return result;
}
