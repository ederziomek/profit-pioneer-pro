import SEO from "@/components/SEO";
import DataUploader from "@/components/import/DataUploader";
import { useAnalytics } from "@/context/AnalyticsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";

const Index = () => {
  const { totals, cohorts, importPayments, importTransactions } = useAnalytics();

  const chartData = cohorts.map((c) => ({
    name: format(c.weekStart, "dd/MM"),
    roi: Number((c.roi * 100).toFixed(1)),
  }));

  return (
    <div className="space-y-8">
      <SEO title="Dashboard — IG Afiliados Analytics" description="Resumo de ROI, cohorts e carregamento de planilhas." canonical="/" />

      <section className="rounded-xl p-8 bg-hero-gradient text-primary-foreground shadow-glow hover:tilt">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold">Dashboard — IG Afiliados Analytics</h1>
            <p className="opacity-90">Carregue as planilhas de Transações e Pagamentos para iniciar as análises.</p>
          </div>
          <DataUploader onTransactions={importTransactions} onPayments={importPayments} />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-soft">
          <CardHeader><CardTitle>Total Clientes</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{totals ? totals.totalCustomers.toLocaleString() : "—"}</CardContent>
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
                  <Bar dataKey="roi" fill="hsl(var(--primary))" />
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
