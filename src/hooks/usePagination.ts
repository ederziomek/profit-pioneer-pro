import { useState, useMemo } from 'react';

export interface PaginationConfig {
  pageSize: number;
  currentPage: number;
}

export function usePagination<T>(data: T[], defaultPageSize: number = 20, externalTotal?: number) {
  const [pagination, setPagination] = useState<PaginationConfig>({
    pageSize: defaultPageSize,
    currentPage: 1,
  });

  // Usar o total externo se fornecido, senão usar o tamanho dos dados
  const totalItems = externalTotal !== undefined ? externalTotal : data.length;
  const totalPages = Math.ceil(totalItems / pagination.pageSize);
  
  const paginatedData = useMemo(() => {
    // Se temos dados locais e não há total externo, aplicar paginação local
    if (externalTotal === undefined) {
      const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
      const endIndex = startIndex + pagination.pageSize;
      return data.slice(startIndex, endIndex);
    }
    // Se há total externo, retornar os dados como estão (paginação no backend)
    return data;
  }, [data, pagination.pageSize, pagination.currentPage, externalTotal]);

  const goToPage = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    setPagination(prev => ({ ...prev, currentPage: validPage }));
  };

  const nextPage = () => {
    if (pagination.currentPage < totalPages) {
      goToPage(pagination.currentPage + 1);
    }
  };

  const prevPage = () => {
    if (pagination.currentPage > 1) {
      goToPage(pagination.currentPage - 1);
    }
  };

  const changePageSize = (newPageSize: number) => {
    setPagination({
      pageSize: newPageSize,
      currentPage: 1, // Reset to first page when changing page size
    });
  };

  const resetPagination = () => {
    setPagination({
      pageSize: defaultPageSize,
      currentPage: 1,
    });
  };

  return {
    paginatedData,
    pagination,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    changePageSize,
    resetPagination,
    hasNextPage: pagination.currentPage < totalPages,
    hasPrevPage: pagination.currentPage > 1,
    startIndex: (pagination.currentPage - 1) * pagination.pageSize + 1,
    endIndex: Math.min(pagination.currentPage * pagination.pageSize, totalItems),
    totalItems,
  };
}