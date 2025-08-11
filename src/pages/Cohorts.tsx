import SEO from "@/components/SEO";
import { useAnalytics } from "@/context/AnalyticsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

const Cohorts = () => {
  const { cohorts } = useAnalytics();
  return (
    <div className="space-y-6">
      <SEO title="Cohorts — IG Afiliados Analytics" description="Tabela semanal de cohorts com CAC, LTV e ROI." canonical="/cohorts" />
      <Card className="shadow-soft">
        <CardHeader><CardTitle>Cohorts Semanais</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Semana</th>
                  <th className="text-right">Clientes</th>
                  <th className="text-right">CAC CPA</th>
                  <th className="text-right">CAC REV</th>
                  <th className="text-right">CAC Total</th>
                  <th className="text-right">LTV Total</th>
                  <th className="text-right">ROI</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.weekStart.toString()} className="border-b last:border-0">
                    <td className="py-2">{format(c.weekStart, "dd/MM/yyyy")}</td>
                    <td className="text-right">{c.customers}</td>
                    <td className="text-right">{c.cac_cpa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="text-right">{c.cac_rev.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="text-right">{c.cac_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="text-right">{c.ltv_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="text-right">{(c.roi * 100).toFixed(1)}%</td>
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
