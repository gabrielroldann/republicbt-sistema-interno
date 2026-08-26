import { useState } from 'react';
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel,
  useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Table, TBody, TD, TH, THead, TR, TableWrap, EstadoVazio } from '@/components/ui/table';
import { SkeletonTabela } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn, fmtNum } from '@/lib/utils';

interface Props<T> {
  colunas: ColumnDef<T, unknown>[];
  dados: T[] | undefined;
  carregando?: boolean;
  vazio?: string;
  porPagina?: number;
  ordenacaoInicial?: SortingState;
  /** Alinha à direita as colunas cujo id esteja aqui. */
  colunasNumericas?: string[];
  altura?: string;
}

export function DataTable<T>({
  colunas, dados, carregando, vazio = 'Nenhum registro no período.',
  porPagina = 15, ordenacaoInicial = [], colunasNumericas = [], altura = 'max-h-[560px]',
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>(ordenacaoInicial);

  const table = useReactTable({
    data: dados ?? [],
    columns: colunas,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: porPagina } },
  });

  if (carregando) return <SkeletonTabela linhas={8} colunas={colunas.length} />;
  if (!dados?.length) return <EstadoVazio>{vazio}</EstadoVazio>;

  const ehNum = (id: string) => colunasNumericas.includes(id);
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const de = pageIndex * pageSize + 1;
  const ate = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <>
      <TableWrap className={altura}>
        <Table>
          <THead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const ordenavel = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  return (
                    <TH key={h.id} num={ehNum(h.column.id)}>
                      {ordenavel ? (
                        <button
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn(
                            'inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-ink',
                            ehNum(h.column.id) && 'flex-row-reverse',
                          )}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === 'asc' ? <ArrowUp className="h-3 w-3" />
                            : dir === 'desc' ? <ArrowDown className="h-3 w-3" />
                            : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TH>
                  );
                })}
              </tr>
            ))}
          </THead>
          <TBody>
            {table.getRowModel().rows.map((row) => (
              <TR key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TD key={cell.id} num={ehNum(cell.column.id)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>

      {total > pageSize && (
        <div className="flex items-center justify-between border-t border-line-soft px-5 py-2.5">
          <span className="text-2xs text-muted">
            {fmtNum(de)}–{fmtNum(ate)} de {fmtNum(total)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="iconSm"
              onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 text-2xs text-muted">
              {pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button
              variant="outline" size="iconSm"
              onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
