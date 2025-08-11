import SEO from "@/components/SEO";
import { useAnalytics } from "@/context/AnalyticsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Fraud = () => {
  const { suspicious } = useAnalytics();
  return (
    <div className="space-y-6">
      <SEO title="Fraudes — IG Afiliados Analytics" description="Alertas de suspeita e critérios de fraude." canonical="/fraudes" />
      <Card className="shadow-soft">
        <CardHeader><CardTitle>Afiliados Suspeitos</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Afiliado</th>
                  <th className="text-right">Score</th>
                  <th className="text-right">ROI</th>
                  <th className="text-right">Taxa Rejeição</th>
                </tr>
              </thead>
              <tbody>
                {suspicious.map((a) => (
                  <tr key={a.afiliados_id} className="border-b last:border-0">
                    <td className="py-2">#{a.afiliados_id}</td>
                    <td className="text-right font-semibold">{a.score}</td>
                    <td className="text-right">{(a.roi * 100).toFixed(1)}%</td>
                    <td className="text-right">{(a.rejectedRate * 100).toFixed(1)}%</td>
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

export default Fraud;
