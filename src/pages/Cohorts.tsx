import SEO from "@/components/SEO";
import { useAnalytics } from "@/context/AnalyticsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import React from "react";
import { computeCohortsV2 } from "@/lib/analytics";
import type { CohortGranularity, CohortSummaryV2 } from "@/types/analytics";
import { useSorting } from "@/hooks/useSorting";
import { SortableHeader } from "@/components/ui/sortable-header";

const Cohorts = () => {
  const { dataset } = useAnalytics();
  const [granularity, setGranularity] = React.useState<CohortGranularity>("week");
  const [showDetails, setShowDetails] = React.useState(false);

  const rows = React.useMemo(() => {
    if (!dataset) return [];
    return computeCohortsV2(dataset, granularity);
  }, [dataset, granularity]);

  // Configurar ordenação padrão por período (mais recente primeiro)
  const { sortedData, sortConfig, requestSort } = useSorting<CohortSummaryV2>(rows, {
    key: 'periodStart',
    direction: 'desc'
  });

  const formatMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleSort = (key: keyof CohortSummaryV2) => {
    requestSort(key);
  };

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
            <Button variant={showDetails ? "default" : "outline"} onClick={() => setShowDetails(!showDetails)}>
              {showDetails ? "Ocultar Detalhes" : "Ver Detalhes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <SortableHeader
                    sortKey="periodStart"
                    currentSortKey={sortConfig?.key}
                    currentDirection={sortConfig?.direction}
                    onSort={handleSort}
                  >
                    Período
                  </SortableHeader>
                  {showDetails && (
                    <SortableHeader
                      sortKey="tempo"
                      currentSortKey={sortConfig?.key}
                      currentDirection={sortConfig?.direction}
                      onSort={handleSort}
                      align="right"
                    >
                      Tempo
                    </SortableHeader>
                  )}
                  <SortableHeader
                    sortKey="customers"
                    currentSortKey={sortConfig?.key}
                    currentDirection={sortConfig?.direction}
                    onSort={handleSort}
                    align="right"
                  >
                    Clientes
                  </SortableHeader>
                  <SortableHeader
                    sortKey="deposits"
                    currentSortKey={sortConfig?.key}
                    currentDirection={sortConfig?.direction}
                    onSort={handleSort}
                    align="right"
                  >
                    Depósitos
                  </SortableHeader>
                  {showDetails && (
                    <SortableHeader
                      sortKey="withdrawals"
                      currentSortKey={sortConfig?.key}
                      currentDirection={sortConfig?.direction}
                      onSort={handleSort}
                      align="right"
                    >
                      Saques
                    </SortableHeader>
                  )}
                  <SortableHeader
                    sortKey="ggr"
                    currentSortKey={sortConfig?.key}
                    currentDirection={sortConfig?.direction}
                    onSort={handleSort}
                    align="right"
                  >
                    GGR
                  </SortableHeader>
                  {showDetails && (
                    <>
                      <SortableHeader
                        sortKey="chargeback"
                        currentSortKey={sortConfig?.key}
                        currentDirection={sortConfig?.direction}
                        onSort={handleSort}
                        align="right"
                      >
                        Chargeback
                      </SortableHeader>
                      <SortableHeader
                        sortKey="ngr_total"
                        currentSortKey={sortConfig?.key}
                        currentDirection={sortConfig?.direction}
                        onSort={handleSort}
                        align="right"
                      >
                        NGR
                      </SortableHeader>
                      <SortableHeader
                        sortKey="cpa_pago"
                        currentSortKey={sortConfig?.key}
                        currentDirection={sortConfig?.direction}
                        onSort={handleSort}
                        align="right"
                      >
                        CPA Pago
                      </SortableHeader>
                      <SortableHeader
                        sortKey="rev_pago"
                        currentSortKey={sortConfig?.key}
                        currentDirection={sortConfig?.direction}
                        onSort={handleSort}
                        align="right"
                      >
                        REV Pago
                      </SortableHeader>
                    </>
                  )}
                  <SortableHeader
                    sortKey="pago_total"
                    currentSortKey={sortConfig?.key}
                    currentDirection={sortConfig?.direction}
                    onSort={handleSort}
                    align="right"
                  >
                    Pago Total
                  </SortableHeader>
                  <SortableHeader
                    sortKey="lucro"
                    currentSortKey={sortConfig?.key}
                    currentDirection={sortConfig?.direction}
                    onSort={handleSort}
                    align="right"
                  >
                    Lucro
                  </SortableHeader>
                  <SortableHeader
                    sortKey="roi"
                    currentSortKey={sortConfig?.key}
                    currentDirection={sortConfig?.direction}
                    onSort={handleSort}
                    align="right"
                  >
                    ROI
                  </SortableHeader>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((r) => (
                  <tr key={`${r.granularity}-${r.periodStart.toString()}`} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2">{format(r.periodStart, "dd/MM/yyyy")}</td>
                    {showDetails && <td className="text-right">{r.tempo}</td>}
                    <td className="text-right">{r.customers}</td>
                    <td className="text-right">{formatMoney(r.deposits)}</td>
                    {showDetails && <td className="text-right">{formatMoney(r.withdrawals)}</td>}
                    <td className="text-right">{formatMoney(r.ggr)}</td>
                    {showDetails && (
                      <>
                        <td className="text-right">{formatMoney(r.chargeback)}</td>
                        <td className="text-right">{formatMoney(r.ngr_total)}</td>
                        <td className="text-right">{formatMoney(r.cpa_pago)}</td>
                        <td className="text-right">{formatMoney(r.rev_pago)}</td>
                      </>
                    )}
                    <td className="text-right">{formatMoney(r.pago_total)}</td>
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

