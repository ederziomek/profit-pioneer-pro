import SEO from "@/components/SEO";
import { useAnalytics } from "@/context/AnalyticsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import React from "react";
import { useSorting } from "@/hooks/useSorting";
import { usePagination } from "@/hooks/usePagination";
import { SortableHeader } from "@/components/ui/sortable-header";
import { Pagination } from "@/components/ui/pagination";
import type { AffiliatePaidSummary } from "@/types/analytics";

const Affiliates = () => {
  const { getPaginatedAffiliates } = useAnalytics();
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [affiliatesData, setAffiliatesData] = React.useState<AffiliatePaidSummary[]>([]);
  const [totalAffiliates, setTotalAffiliates] = React.useState(0);

  const dateRange = React.useMemo(() => {
    if (start && end) return { start: new Date(start), end: new Date(end) };
    return undefined;
  }, [start, end]);

  // Configurar paginação com 20 itens por padrão
  const {
    pagination,
    totalPages,
    goToPage,
    changePageSize,
    startIndex,
    endIndex,
    totalItems,
  } = usePagination([], 20, totalAffiliates); // Array vazio inicial, será preenchido pelos dados do backend

  // Configurar ordenação padrão por NGR (maior para menor)
  const { sortedData, sortConfig, requestSort } = useSorting<AffiliatePaidSummary>(affiliatesData, {
    key: 'ngr_total',
    direction: 'desc'
  });

  // Função para carregar dados paginados
  const loadAffiliates = React.useCallback(async (page: number, pageSize: number) => {
    setLoading(true);
    try {
      const result = await getPaginatedAffiliates(page, pageSize, dateRange);
      setAffiliatesData(result.data);
      setTotalAffiliates(result.total);
      
      // Atualizar o hook de paginação com o total real
      if (result.total !== totalItems) {
        // Forçar recálculo da paginação
        const newTotalPages = Math.ceil(result.total / pageSize);
        if (page > newTotalPages) {
          goToPage(1); // Voltar para primeira página se necessário
        }
      }
    } catch (error) {
      console.error('Erro ao carregar afiliados:', error);
    } finally {
      setLoading(false);
    }
  }, [getPaginatedAffiliates, dateRange, totalItems, goToPage]);

  // Carregar dados quando mudar página ou tamanho da página
  React.useEffect(() => {
    loadAffiliates(pagination.currentPage, pagination.pageSize);
  }, [pagination.currentPage, pagination.pageSize, loadAffiliates]);

  // Recarregar quando mudar filtros de data
  React.useEffect(() => {
    if (pagination.currentPage === 1) {
      loadAffiliates(1, pagination.pageSize);
    } else {
      goToPage(1); // Voltar para primeira página ao mudar filtros
    }
  }, [dateRange, pagination.pageSize, goToPage, loadAffiliates]);

  const formatMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleSort = (key: keyof AffiliatePaidSummary) => {
    requestSort(key);
  };

  const handlePageChange = (page: number) => {
    goToPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    changePageSize(newPageSize);
  };

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
          {loading && (
            <div className="flex justify-center py-8">
              <div className="text-muted-foreground">Carregando afiliados...</div>
            </div>
          )}
          
          {!loading && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <SortableHeader
                        sortKey="afiliados_id"
                        currentSortKey={sortConfig?.key}
                        currentDirection={sortConfig?.direction}
                        onSort={handleSort}
                      >
                        Afiliado
                      </SortableHeader>
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
                      <SortableHeader
                        sortKey="total_recebido"
                        currentSortKey={sortConfig?.key}
                        currentDirection={sortConfig?.direction}
                        onSort={handleSort}
                        align="right"
                      >
                        Total Recebido
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
                    {sortedData.map((a) => (
                      <tr key={a.afiliados_id} className="border-b last:border-0 hover:bg-muted/50">
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
              
              {/* Componente de Paginação */}
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={totalPages}
                pageSize={pagination.pageSize}
                totalItems={totalAffiliates}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                pageSizeOptions={[20, 100]}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Affiliates;

