import SEO from "@/components/SEO";
import DataUploader from "@/components/import/DataUploader";
import { useAnalytics } from "@/context/AnalyticsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { format } from "date-fns";
import { computeCohortsV2 } from "@/lib/analytics";
const Index = () => {
const { totals, cohorts, affiliates, importPayments, importTransactions, dataset } = useAnalytics();

const rows = dataset ? computeCohortsV2(dataset, "week") : [];
const chartData = rows.map((r) => ({
  name: format(r.periodStart, "dd/MM"),
  roi: r.roi == null ? 0 : Number(((r.roi) * 100).toFixed(1)),
}));

  return (
    <div className="space-y-8">
      <SEO title="Dashboard — IG Afiliados Analytics" description="Resumo de ROI, cohorts e carregamento de planilhas." canonical="/" />

      <section className="rounded-xl p-8 bg-hero-gradient text-primary-foreground shadow-glow hover:tilt">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold text-muted-foreground">Dashboard — IG Afiliados Analytics</h1>
            <p className="opacity-90">Carregue as planilhas de Transações e Pagamentos para iniciar as análises.</p>
          </div>
          <DataUploader onTransactions={importTransactions} onPayments={importPayments} />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="shadow-soft">
          <CardHeader><CardTitle>Total Clientes</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{totals ? totals.totalCustomers.toLocaleString() : "—"}</CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardHeader><CardTitle>Afiliados</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{affiliates.length.toLocaleString()}</CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardHeader><CardTitle>CAC Total (R$)</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{totals ? totals.cacTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardHeader><CardTitle>LTV Total (R$)</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{totals ? totals.ltvTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardHeader><CardTitle>ROI</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{totals ? `${(totals.roi * 100).toFixed(1)}%` : "—"}</CardContent>
        </Card>
      </section>

      <section>
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>ROI por Cohort (semana do primeiro CPA)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis unit="%" />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Bar dataKey="roi">
                    {chartData.map((d, idx) => (
                      <Cell key={`roi-${idx}`} fill={d.roi >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Index;
