import { useState, useMemo } from 'react';

export interface PaginationConfig {
  pageSize: number;
  currentPage: number;
}

export function usePagination<T>(data: T[], defaultPageSize: number = 20) {
  const [pagination, setPagination] = useState<PaginationConfig>({
    pageSize: defaultPageSize,
    currentPage: 1,
  });

  const totalPages = Math.ceil(data.length / pagination.pageSize);
  
  const paginatedData = useMemo(() => {
    const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    return data.slice(startIndex, endIndex);
  }, [data, pagination.pageSize, pagination.currentPage]);

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
    endIndex: Math.min(pagination.currentPage * pagination.pageSize, data.length),
    totalItems: data.length,
  };
}