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

function crumbName(id: string, name: string): string {
  return id === ROOT_NODE ? 'Stage' : name;
}

export function NodeBreadcrumb({ nodeId }: { nodeId: string }) {
  // Deliberate departure from the brief: read straight from `query` during
  // render instead of through a second useEditor collector keyed on `nodeId`.
  // NodeBreadcrumb re-renders whenever its parent Inspector does (on every
  // Craft.js notification), so `query` -- which always reflects the live
  // store -- is already fresh here. A collector closing over the `nodeId`
  // prop instead only re-runs on the *next* notification, one render behind
  // the very selection change that produced this nodeId: verified live in the
  // browser (selecting the root left the breadcrumb reading the previously
  // selected node's crumb until the following click). This is the same
  // closure-lag characteristic of Craft's useCollector documented for
  // Inspector's props/childCount collector, applied here too.
  const { actions, query } = useEditor();
  const nodeName = (id: string): string => query.node(id).get()?.data.name ?? '';
  const ancestors = query
    .node(nodeId)
    .ancestors(true)
    .filter((id) => !ZONE_TYPES.has(nodeName(id)))
    .reverse();
  const trail = ancestors.map((id) => ({ id, name: crumbName(id, nodeName(id)) }));
  const current = crumbName(nodeId, nodeName(nodeId));

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
