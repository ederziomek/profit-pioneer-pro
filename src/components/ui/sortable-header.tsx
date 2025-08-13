import React from 'react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface SortableHeaderProps {
  children: React.ReactNode;
  sortKey: string;
  currentSortKey?: string;
  currentDirection?: 'asc' | 'desc';
  onSort: (key: string) => void;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export function SortableHeader({
  children,
  sortKey,
  currentSortKey,
  currentDirection,
  onSort,
  className,
  align = 'left',
}: SortableHeaderProps) {
  const isActive = currentSortKey === sortKey;
  
  const getSortIcon = () => {
    if (!isActive) return '↕️';
    return currentDirection === 'asc' ? '↑' : '↓';
  };

  const getAlignmentClass = () => {
    switch (align) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      default:
        return 'text-left';
    }
  };

  return (
    <th className={cn('py-2 cursor-pointer hover:bg-muted/50 transition-colors', getAlignmentClass(), className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSort(sortKey)}
        className={cn(
          'h-auto p-0 font-medium hover:bg-transparent',
          isActive && 'text-primary font-semibold'
        )}
      >
        <div className="flex items-center gap-1">
          <span>{children}</span>
          <span className="text-xs opacity-60">{getSortIcon()}</span>
        </div>
      </Button>
    </th>
  );
}