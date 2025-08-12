import SEO from "@/components/SEO";
import { useAnalytics } from "@/context/AnalyticsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import React from "react";
import { computeAffiliatesPaid } from "@/lib/analytics";

const Affiliates = () => {
  const { dataset } = useAnalytics();
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");

  const dateRange = React.useMemo(() => {
    if (start && end) return { start: new Date(start), end: new Date(end) };
    return undefined;
  }, [start, end]);

  const rows = React.useMemo(() => {
    if (!dataset) return [];
    return computeAffiliatesPaid(dataset, dateRange);
  }, [dataset, dateRange]);

  const formatMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <SEO title="Afiliados — IG Afiliados Analytics" description="Totais por afiliado de NGR, CPA, REV e ROI, com filtro por atividade em período." canonical="/afiliados" />
      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Afiliados (Total âncora → hoje)</CardTitle>
            <div className="flex items-end gap-2">
              <div className="flex flex-col text-xs">
                <label htmlFor="start">Início</label>
                <input id="start" type="date" className="border rounded px-2 py-1 bg-background" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="flex flex-col text-xs">
                <label htmlFor="end">Fim</label>
                <input id="end" type="date" className="border rounded px-2 py-1 bg-background" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <Button variant="secondary" onClick={() => { /* no-op, state already updates via bindings */ }}>Aplicar filtro</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Afiliado</th>
                  <th className="text-right">Clientes</th>
                  <th className="text-right">NGR</th>
                  <th className="text-right">CPA Pago</th>
                  <th className="text-right">REV Pago</th>
                  <th className="text-right">Total Recebido</th>
                  <th className="text-right">ROI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.afiliados_id} className="border-b last:border-0">
                    <td className="py-2">#{a.afiliados_id}</td>
                    <td className="text-right">{a.customers}</td>
                    <td className="text-right">{formatMoney(a.ngr_total)}</td>
                    <td className="text-right">{formatMoney(a.cpa_pago)}</td>
                    <td className="text-right">{formatMoney(a.rev_pago)}</td>
                    <td className="text-right">{formatMoney(a.total_recebido)}</td>
                    <td className="text-right">{a.roi == null ? "—" : `${(a.roi * 100).toFixed(1)}%`}</td>
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

export default Affiliates;

