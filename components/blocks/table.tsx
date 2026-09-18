import { useWriter } from '@/components/workbench/writer/context';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useNode, type UserComponent } from '@craftjs/core';
import {
  Table as UiTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { parseList } from '@/lib/lists';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type TableRows = 1 | 2 | 3 | 4 | 5;

export interface TableBlockProps extends GrowProps {
  displayState?: 'default' | 'empty' | 'noResults' | 'loading' | 'error';
  emptyTitle?: string; emptyDescription?: string; noResultsText?: string; loadingText?: string; errorTitle?: string; errorDescription?: string; filterLabels?: string;
  recordData?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  filterColumn?: string;
  columns: string;
  rows: TableRows;
}

export const TABLE_DEFAULTS: TableBlockProps = {
  displayState: 'default', emptyTitle: 'No records yet', emptyDescription: 'New records will appear here.', noResultsText: 'No matching records. Try another search or filter.', loadingText: 'Loading records…', errorTitle: 'Could not load records', errorDescription: 'Please try again in a moment.', filterLabels: '',
  columns: 'Name, Status, Updated',
  rows: 3,
  recordData: '',
  searchable: false,
  searchPlaceholder: 'Search table…',
  filterColumn: '',
  grow: false,
};

export const Table: UserComponent<Partial<TableBlockProps>> = (props) => {
  const merged: TableBlockProps = { ...TABLE_DEFAULTS, ...props };
  const play = usePlay();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const {
    connectors: { connect, drag },
    custom, id,
  } = useNode((node) => ({ custom: node.data.custom, id: node.id }));
  const writer = useWriter();
  const writerKey = JSON.stringify([writer?.scope ?? id, writer?.scope ? id : null]);
  if (writer?.statePreview?.key === writerKey) merged.displayState = writer.statePreview.state as TableBlockProps['displayState'];
  const columns = parseList(merged.columns);
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  if (merged.displayState && merged.displayState !== 'default') {
    const state = merged.displayState;
    const titleProp = state === 'empty' ? 'emptyTitle' : state === 'error' ? 'errorTitle' : state === 'loading' ? 'loadingText' : 'noResultsText';
    const descriptionProp = state === 'empty' ? 'emptyDescription' : state === 'error' ? 'errorDescription' : null;
    return <div ref={element => { if (element) connect(drag(element)); }} data-block="Table" className={cn('min-w-0', blockClasses(merged))}>
      <UiTable><TableHeader><TableRow>{columns.map(column => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader></UiTable>
      <div role={state === 'error' ? 'alert' : 'status'} className="flex min-h-48 flex-col items-center justify-center gap-2 rounded border border-dashed p-8 text-center">
        <p data-writer-prop={titleProp} className="font-medium">{merged[titleProp]}</p>
        {descriptionProp && <p data-writer-prop={descriptionProp} className="text-sm text-muted-foreground">{merged[descriptionProp]}</p>}
      </div>
    </div>;
  }
  if (merged.recordData?.trim()) {
    const records = merged.recordData.split(/\n|;/).map(row => row.split('|').map(cell => cell.trim())).filter(row => row.some(Boolean));
    const filterIndex = columns.findIndex(column => column.toLowerCase() === merged.filterColumn?.toLowerCase());
    const filters = filterIndex < 0 ? [] : [...new Set(records.map(row => row[filterIndex]).filter(Boolean))];
    const activeFilter = filters.includes(filter) ? filter : 'All';
    const visible = records.filter(row => (activeFilter === 'All' || row[filterIndex] === activeFilter) && row.join(' ').toLowerCase().includes(search.toLowerCase().trim()));
    const interactive = play.mode === 'play';
    return <div ref={element => { if (element) connect(drag(element)); }} data-block="Table" className={cn('min-w-0 space-y-4', blockClasses(merged))} onClick={onClick}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {filters.length > 0 && <div role="group" aria-label="Table filters" className="flex flex-wrap gap-2">{['All', ...filters].map((value, chipIndex) => <Button key={value} variant={activeFilter === value ? 'default' : 'outline'} size="sm" className="rounded-full" aria-pressed={activeFilter === value} tabIndex={interactive ? undefined : -1} onClick={event => { event.stopPropagation(); if (interactive) setFilter(value); }}>{parseList(merged.filterLabels || '')[chipIndex] || value} <span className="opacity-60">{value === 'All' ? records.length : records.filter(row => row[filterIndex] === value).length}</span></Button>)}</div>}
        {merged.searchable && <Input aria-label="Search table" placeholder={merged.searchPlaceholder || 'Search table…'} className="w-64 max-w-full" value={search} readOnly={!interactive} tabIndex={interactive ? undefined : -1} onChange={event => setSearch(event.target.value)} onClick={event => event.stopPropagation()} />}
      </div>
      <UiTable><TableHeader><TableRow>{columns.map(column => <TableHead key={column} className="h-12">{column}</TableHead>)}</TableRow></TableHeader><TableBody>
        {visible.map((row, rowIndex) => <TableRow key={rowIndex}>{columns.map((column, index) => <TableCell key={column} className="h-14">{index === filterIndex ? <Badge variant="secondary" className="rounded-full">{row[index]}</Badge> : row[index] || '—'}</TableCell>)}</TableRow>)}
        {!visible.length && <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">{merged.noResultsText}</TableCell></TableRow>}
      </TableBody></UiTable>
      <p aria-live="polite" className="text-xs text-muted-foreground">Showing {visible.length} of {records.length} records</p>
    </div>;
  }

  return (
    <UiTable
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Table"
      className={cn(blockClasses(merged))}
      onClick={onClick}
    >
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: merged.rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {columns.map((column, columnIndex) => (
              <TableCell key={columnIndex} className="text-muted-foreground">
                Cell
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </UiTable>
  );
};

Table.craft = {
  displayName: 'Table',
  props: TABLE_DEFAULTS,
};

export const tableSchema: BlockSchema = {
  type: 'Table',
  fields: [
    { prop: 'displayState', label: 'Preview state', kind: 'select', section: 'State', options: ['default', 'empty', 'noResults', 'loading', 'error'].map(value => ({value, label: ({default:'Default',empty:'Empty',noResults:'No results',loading:'Loading',error:'Error'})[value]!})) },
    ...(['emptyTitle','emptyDescription','noResultsText','loadingText','errorTitle','errorDescription','filterLabels'] as const).map(prop => ({ prop, label: ({emptyTitle:'Empty title',emptyDescription:'Empty description',noResultsText:'No results message',loadingText:'Loading message',errorTitle:'Error title',errorDescription:'Error description',filterLabels:'Filter chip labels (in order)'})[prop], kind: 'text' as const, section: 'Content' as const })),
    { prop: 'recordData', label: 'Row data ( | between cells; ; between rows)', kind: 'text', section: 'Content' },
    { prop: 'searchable', label: 'Show search', kind: 'boolean', section: 'Content' },
    { prop: 'searchPlaceholder', label: 'Search placeholder', kind: 'text', section: 'Content', showWhen: p => !!p.searchable },
    { prop: 'filterColumn', label: 'Filter column name', kind: 'text', section: 'Content' },
    { prop: 'columns', label: 'Columns', kind: 'text', section: 'Content' },
    {
      prop: 'rows',
      label: 'Rows',
      kind: 'select',
      section: 'Content',
      options: [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) })),
    },
    GROW_FIELD,
  ],
};
