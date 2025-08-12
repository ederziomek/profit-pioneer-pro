import SEO from "@/components/SEO";
import { useAnalytics } from "@/context/AnalyticsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import React from "react";
import { computeCohortsV2 } from "@/lib/analytics";
import type { CohortGranularity } from "@/types/analytics";

const Cohorts = () => {
  const { dataset } = useAnalytics();
  const [granularity, setGranularity] = React.useState<CohortGranularity>("week");

  const rows = React.useMemo(() => {
    if (!dataset) return [];
    return computeCohortsV2(dataset, granularity);
  }, [dataset, granularity]);

  const formatMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <SEO title={`Cohorts (${granularity}) — IG Afiliados Analytics`} description="Cohorts por dia, semana ou mês com NGR, CPA e ROI." canonical="/cohorts" />
      <Card className="shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Cohorts por {granularity === "day" ? "Dia" : granularity === "week" ? "Semana" : "Mês"}</CardTitle>
          <div className="flex gap-2">
            <Button variant={granularity === "day" ? "default" : "secondary"} onClick={() => setGranularity("day")}>Diário</Button>
            <Button variant={granularity === "week" ? "default" : "secondary"} onClick={() => setGranularity("week")}>Semanal</Button>
            <Button variant={granularity === "month" ? "default" : "secondary"} onClick={() => setGranularity("month")}>Mensal</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Período</th>
                  <th className="text-right">Tempo</th>
                  <th className="text-right">Clientes</th>
                  <th className="text-right">Depósitos</th>
                  <th className="text-right">Saques</th>
                  <th className="text-right">GGR</th>
                  <th className="text-right">Chargeback</th>
                  <th className="text-right">NGR</th>
                  <th className="text-right">CPA Pago</th>
                  <th className="text-right">REV Pago</th>
                  <th className="text-right">Pago Total</th>
                  <th className="text-right">LTV</th>
                  <th className="text-right">Lucro</th>
                  <th className="text-right">ROI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.granularity}-${r.periodStart.toString()}`} className="border-b last:border-0">
                    <td className="py-2">{format(r.periodStart, "dd/MM/yyyy")}</td>
                    <td className="text-right">{r.tempo}</td>
                    <td className="text-right">{r.customers}</td>
                    <td className="text-right">{formatMoney(r.deposits)}</td>
                    <td className="text-right">{formatMoney(r.withdrawals)}</td>
                    <td className="text-right">{formatMoney(r.ggr)}</td>
                    <td className="text-right">{formatMoney(r.chargeback)}</td>
                    <td className="text-right">{formatMoney(r.ngr_total)}</td>
                    <td className="text-right">{formatMoney(r.cpa_pago)}</td>
                    <td className="text-right">{formatMoney(r.rev_pago)}</td>
                    <td className="text-right">{formatMoney(r.pago_total)}</td>
                    <td className="text-right">{formatMoney(r.ltv_total)}</td>
                    <td className="text-right">{formatMoney(r.lucro)}</td>
                    <td className="text-right">{r.roi == null ? "—" : `${(r.roi * 100).toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Cohorts;

