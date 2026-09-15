'use client';
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
  const { connectors: { connect, drag } } = useNode();
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
    <div ref={setHost} className={play.mode === 'play' ? 'custom-component-content' : 'custom-component-content pointer-events-none'}>
      <StageProvider initialWidth={width}><Editor resolver={resolver} enabled={false}><Frame data={resolved} /><Sync layout={resolved} width={width} /></Editor></StageProvider>
    </div>
  </div>;
};
CustomComponent.craft = { displayName: 'Custom component', props: { overrides: {} } };
