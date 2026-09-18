'use client';
import { WriterContext, useWriter } from '@/components/workbench/writer/context';
import { designStyle, type DesignProps } from './design-controls';
import { Editor, Frame, useNode, type UserComponent } from '@craftjs/core';
import { useEffect, useState } from 'react';
import { useEditor } from '@craftjs/core';
import { StageProvider, useStage } from '@/components/workbench/stage-context';
import { resolver } from './registry';
import { applyContent, type ContentOverrides } from '@/lib/custom-components/model';
import { usePlay } from '@/components/play/play-context';

export interface CustomComponentProps {
  widthMode?: 'fill' | 'fixed' | 'percent'; widthPx?: number; widthPercent?: number; maxWidth?: DesignProps['maxWidth'];
  componentId: string; name: string; layout: string; overrides?: ContentOverrides;
}
function Sync({ layout, width }: { layout: string; width: number }) {
  const { setWidth } = useStage();
  useEffect(() => { setWidth(width); }, [setWidth, width]);
  const { actions } = useEditor();
  useEffect(() => { actions.history.ignore().deserialize(layout); }, [actions, layout]);
  return null;
}
export const CustomComponent: UserComponent<CustomComponentProps> = ({ name, layout, overrides, widthMode = 'fill', widthPx = 320, widthPercent = 100, maxWidth }) => {
  const { id, connectors: { connect, drag } } = useNode();
  const writer = useWriter();
  const play = usePlay();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!host) return;
    const update = () => { if (host.clientWidth > 0) setWidth(host.clientWidth); };
    const observer = new ResizeObserver(update);
    observer.observe(host); update();
    return () => observer.disconnect();
  }, [host]);
  if (!layout) return <div>Empty component</div>;
  const resolved = applyContent(layout, overrides);
  return <div ref={el => { if (el) connect(drag(el)); }} data-block="CustomComponent" aria-label={name} className="min-w-0" style={designStyle({ widthMode, widthPx, widthPercent, maxWidth } as DesignProps)}>
    <div ref={setHost} className={play.mode === 'play' || writer ? 'custom-component-content' : 'custom-component-content pointer-events-none'}>
      <WriterContext.Provider value={writer ? { ...writer, scope: id } : null}><StageProvider initialWidth={width}><Editor resolver={resolver} enabled={false} {...(writer ? { onRender: writer.renderer } : {})}><Frame data={resolved} /><Sync layout={resolved} width={width} /></Editor></StageProvider></WriterContext.Provider>
    </div>
  </div>;
};
CustomComponent.craft = { displayName: 'Custom component', props: { overrides: {} } };
