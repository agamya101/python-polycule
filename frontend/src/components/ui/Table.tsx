import { useState, useMemo, type ReactNode } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  headerClassName?: string;
}

export interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  rowKey: (row: T) => string | number;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  selectedRowKey?: string | number | null;
  emptyState?: ReactNode;
  pageSize?: number;
  className?: string;
}

export function Table<T>({
  data,
  columns,
  rowKey,
  defaultSortKey,
  defaultSortDir = 'desc',
  onRowClick,
  onRowDoubleClick,
  selectedRowKey,
  emptyState,
  pageSize = 20,
  className,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);
  const [page, setPage] = useState(0);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortValue) return data;
    const fn = col.sortValue;
    return [...data].sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, columns, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedData = sortedData.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  };

  if (data.length === 0 && emptyState) {
    return <div>{emptyState}</div>;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-left border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 border-b border-line text-xs font-mono text-ink-muted uppercase">
            <tr>
              {columns.map((col) => {
                const isSortable = Boolean(col.sortValue);
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={isSortable ? () => handleSort(col.key) : undefined}
                    className={cn(
                      'py-3 px-3.5 font-semibold whitespace-nowrap select-none',
                      isSortable && 'cursor-pointer hover:text-ink',
                      col.headerClassName,
                    )}
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <span>{col.header}</span>
                      {isSortable && (
                        <ArrowUpDown
                          className={cn(
                            'w-3.5 h-3.5',
                            isSorted ? 'text-primary opacity-100' : 'opacity-40',
                          )}
                        />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pagedData.map((row, idx) => {
              const key = rowKey(row);
              const isSelected = selectedRowKey !== undefined && selectedRowKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                  className={cn(
                    'transition-colors hover:bg-surface-2',
                    onRowClick && 'cursor-pointer',
                    isSelected && 'bg-primary/10',
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('py-3 px-3.5 align-middle', col.className)}>
                      {col.render(row, safePage * pageSize + idx)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-ink-muted font-mono px-1">
          <span>
            Showing {safePage * pageSize + 1}–{Math.min(sortedData.length, (safePage + 1) * pageSize)}{' '}
            of {sortedData.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="fp-btn fp-btn-ghost py-1 px-2 text-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span>
              Page {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="fp-btn fp-btn-ghost py-1 px-2 text-xs"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
