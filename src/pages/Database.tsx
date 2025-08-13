import React from "react";
import SEO from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import DataUploader from "@/components/import/DataUploader";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, format } from "date-fns";
import { useAnalytics } from "@/context/AnalyticsContext";

const Database: React.FC = () => {
  const [txCount, setTxCount] = React.useState<number>(0);
  const [pyCount, setPyCount] = React.useState<number>(0);
  const [txWeeks, setTxWeeks] = React.useState<string[]>([]);
  const [pyWeeks, setPyWeeks] = React.useState<string[]>([]);
  const { importTransactions, importPayments, reset } = useAnalytics();
  const [loading, setLoading] = React.useState(false);

  const fetchMeta = React.useCallback(async () => {
    setLoading(true);
    try {
      const [txHead, pyHead] = await Promise.all([
        supabase.from('transactions').select('*', { count: 'exact', head: true }),
        supabase.from('payments').select('*', { count: 'exact', head: true }),
      ]);
      setTxCount(txHead.count ?? 0);
      setPyCount(pyHead.count ?? 0);

      const [txWeeksRes, pyWeeksRes] = await Promise.all([
        supabase.rpc('list_weeks_transactions'),
        supabase.rpc('list_weeks_payments'),
      ]);

      const mapWeeks = (rows?: { week_start: string | Date }[]) => {
        if (!rows) return [] as string[];
        return rows.map((r) => format(new Date(r.week_start as any), 'dd/MM'));
      };

      setTxWeeks(mapWeeks(txWeeksRes.data as any));
      setPyWeeks(mapWeeks(pyWeeksRes.data as any));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  return (
    <div className="space-y-8">
      <SEO title="Banco de Dados — IG Afiliados Analytics" description="Arquivos carregados, contagem de linhas e semanas com dados." canonical="/database" />

      <section className="rounded-xl p-8 bg-hero-gradient text-primary-foreground shadow-glow">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold">Banco de Dados</h1>
            <p className="opacity-90">Veja o estado dos dados e importe novas planilhas sem duplicar.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="topbar" onClick={fetchMeta} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar'}</Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Transações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Linhas carregadas: <span className="font-semibold text-foreground">{txCount.toLocaleString()}</span></p>
            <div>
              <p className="text-sm mb-2">Semanas com dados:</p>
              <div className="flex flex-wrap gap-2">
                {txWeeks.length ? txWeeks.map((w) => (
                  <Badge key={`tx-${w}`} variant="secondary">{w}</Badge>
                )) : <span className="text-muted-foreground text-sm">Nenhuma</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Pagamentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Linhas carregadas: <span className="font-semibold text-foreground">{pyCount.toLocaleString()}</span></p>
            <div>
              <p className="text-sm mb-2">Semanas com dados:</p>
              <div className="flex flex-wrap gap-2">
                {pyWeeks.length ? pyWeeks.map((w) => (
                  <Badge key={`py-${w}`} variant="secondary">{w}</Badge>
                )) : <span className="text-muted-foreground text-sm">Nenhuma</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Importar Dados</CardTitle>
          </CardHeader>
          <CardContent>
            <DataUploader
              onTransactions={async (f) => { await importTransactions(f); await fetchMeta(); }}
              onPayments={async (f) => { await importPayments(f); await fetchMeta(); }}
            />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="shadow-soft border-destructive">
          <CardHeader>
            <CardTitle>Zona de Risco</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Zerar banco de dados</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tem certeza que deseja apagar todos os dados?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação removerá todas as linhas de Transações e Pagamentos. Você poderá importar novamente as planilhas em seguida.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button variant="destructive" onClick={() => { reset(); setTimeout(() => fetchMeta(), 600); }}>Apagar tudo</Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Database;
