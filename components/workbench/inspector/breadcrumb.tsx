'use client';

import { ROOT_NODE, useEditor } from '@craftjs/core';
import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ZONE_TYPES } from '@/components/blocks/registry';
import { selectedIdFrom } from '../selection';

function crumbName(id: string, displayName: string): string {
  return id === ROOT_NODE ? 'Frame' : displayName;
}

export function NodeBreadcrumb() {
  const { actions, trail, current } = useEditor((state, query) => {
    const id = selectedIdFrom(state);
    if (!id || !state.nodes[id]) return { trail: [] as { id: string; name: string }[], current: '' };
    const ancestors = query
      .node(id)
      .ancestors(true)
      .filter((ancestorId) => !ZONE_TYPES.has(state.nodes[ancestorId].data.name))
      .toReversed();
    return {
      trail: ancestors.map((ancestorId) => ({
        id: ancestorId,
        name: crumbName(
          ancestorId,
          state.nodes[ancestorId].data.displayName || state.nodes[ancestorId].data.name,
        ),
      })),
      current: crumbName(id, state.nodes[id].data.displayName || state.nodes[id].data.name),
    };
  });

  if (current === '') return null;

  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1 font-mono text-[10.5px] sm:gap-1">
        {trail.map((crumb) => (
          <Fragment key={crumb.id}>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <button type="button" onClick={() => actions.selectNode(crumb.id)}>
                  {crumb.name}
                </button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage className="font-mono text-[10.5px]">{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
