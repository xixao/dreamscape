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
  columns: string;
  rows: TableRows;
}

export const TABLE_DEFAULTS: TableBlockProps = {
  columns: 'Name, Status, Updated',
  rows: 3,
  grow: false,
};

export const Table: UserComponent<Partial<TableBlockProps>> = (props) => {
  const merged: TableBlockProps = { ...TABLE_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const columns = parseList(merged.columns);
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

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
