import SEO from "@/components/SEO";
import { useAnalytics } from "@/context/AnalyticsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Affiliates = () => {
  const { affiliates } = useAnalytics();
  return (
    <div className="space-y-6">
      <SEO title="Afiliados — IG Afiliados Analytics" description="Ranking de afiliados com NGR, CAC e ROI." canonical="/afiliados" />
      <Card className="shadow-soft">
        <CardHeader><CardTitle>Ranking de Afiliados</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Afiliado</th>
                  <th className="text-right">Clientes</th>
                  <th className="text-right">NGR</th>
                  <th className="text-right">CPA</th>
                  <th className="text-right">REV</th>
                  <th className="text-right">Total Recebido</th>
                  <th className="text-right">ROI</th>
                  <th className="text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map((a) => (
                  <tr key={a.afiliados_id} className="border-b last:border-0">
                    <td className="py-2">#{a.afiliados_id}</td>
                    <td className="text-right">{a.customers}</td>
                    <td className="text-right">{a.ngr_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="text-right">{a.cpa_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="text-right">{a.rev_calculado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="text-right">{a.total_recebido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="text-right">{(a.roi * 100).toFixed(1)}%</td>
                    <td className="text-right">{a.score}</td>
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
