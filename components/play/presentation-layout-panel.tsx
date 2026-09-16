'use client';

import {
  Columns2Icon,
  BriefcaseBusinessIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Code2Icon,
  Grid2X2Icon,
  LayoutTemplateIcon,
  Rows3Icon,
  PaletteIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PANEL, PANEL_HEADER } from '@/components/workbench/chrome';
import type { DevicePresetGroup } from '@/lib/stage/device-presets';
import { cn } from '@/lib/utils';

export type PresentationView = 'design' | 'development' | 'business';
export type PresentationComposition = 'single' | 'side-by-side' | 'flow' | 'grid';
export type PresentationViewport = 'desktop' | 'mobile' | 'both';
export const PRESENTATION_ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type PresentationScale = 'fit' | `${(typeof PRESENTATION_ZOOM_LEVELS)[number]}`;

interface PresentationLayoutPanelProps {
  background: string;
  collapsed: boolean;
  composition: PresentationComposition;
  deviceGroups: DevicePresetGroup[];
  deviceName: string;
  onBackgroundChange: (value: string) => void;
  onClose: () => void;
  onExpand: () => void;
  onCompositionChange: (value: PresentationComposition) => void;
  onDeviceChange: (value: string) => void;
  onReset: () => void;
  onScaleChange: (value: PresentationScale) => void;
  onScreenChange: (value: string) => void;
  onShowDeviceFrameChange: (value: boolean) => void;
  onShowScreenLabelChange: (value: boolean) => void;
  onViewChange: (value: PresentationView) => void;
  onViewportChange: (value: PresentationViewport) => void;
  scale: PresentationScale;
  screenId: string;
  screens: { id: string; name: string }[];
  showDeviceFrame: boolean;
  showScreenLabel: boolean;
  view: PresentationView;
  viewport: PresentationViewport;
}

const viewOptions: { value: PresentationView; label: string; icon: LucideIcon }[] = [
  { value: 'design', label: 'Design', icon: PaletteIcon },
  { value: 'development', label: 'Developer', icon: Code2Icon },
  { value: 'business', label: 'Business', icon: BriefcaseBusinessIcon },
];

const compositionOptions: {
  value: PresentationComposition;
  label: string;
  icon: typeof LayoutTemplateIcon;
}[] = [
  { value: 'single', label: 'Single', icon: LayoutTemplateIcon },
  { value: 'side-by-side', label: 'Side by side', icon: Columns2Icon },
  { value: 'flow', label: 'Flow', icon: Rows3Icon },
  { value: 'grid', label: 'Grid', icon: Grid2X2Icon },
];

const viewportOptions: { value: PresentationViewport; label: string }[] = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'both', label: 'Both' },
];

export function PresentationLayoutPanel({
  background,
  collapsed,
  composition,
  deviceGroups,
  deviceName,
  onBackgroundChange,
  onClose,
  onExpand,
  onCompositionChange,
  onDeviceChange,
  onReset,
  onScaleChange,
  onScreenChange,
  onShowDeviceFrameChange,
  onShowScreenLabelChange,
  onViewChange,
  onViewportChange,
  scale,
  screenId,
  screens,
  showDeviceFrame,
  showScreenLabel,
  view,
  viewport,
}: PresentationLayoutPanelProps) {
  const viewButtons = viewOptions.map(({ value, label, icon: Icon }) => (
    <Tooltip key={value}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={view === value}
          onClick={() => onViewChange(value)}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            view === value && 'bg-accent text-foreground',
            !collapsed && 'flex-1',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  ));

  if (collapsed) {
    return (
      <aside
        aria-label="Presentation views"
        className={cn(PANEL, 'fixed bottom-3 right-3 top-20 z-[85] flex w-10 flex-col items-center gap-1 py-2 lg:static lg:my-3 lg:mr-3 lg:shrink-0')}
      >
        <Button variant="ghost" size="icon" aria-label="Expand display settings" aria-expanded={false} onClick={onExpand}>
          <ChevronLeftIcon className="size-3.5" aria-hidden="true" />
        </Button>
        <div className="my-1 h-px w-6 bg-border" aria-hidden="true" />
        {viewButtons}
      </aside>
    );
  }

  return (
    <aside
      aria-label="Display and layout"
      className={cn(PANEL, 'fixed inset-x-3 bottom-3 z-[85] flex max-h-[78dvh] min-h-0 flex-col lg:static lg:my-3 lg:mr-3 lg:max-h-none lg:w-80 lg:shrink-0')}
    >
      <div className={PANEL_HEADER}>
        <div className="flex flex-1 gap-1" role="group" aria-label="Presentation view">
          {viewButtons}
        </div>
        <Button variant="ghost" size="icon" aria-label="Close display settings" aria-expanded={true} onClick={onClose}>
          <ChevronRightIcon className="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      <div className="space-y-6 overflow-y-auto p-4">
        <div>
          <h2 className="text-sm font-semibold">Display &amp; layout</h2>
          <p className="mt-1 text-xs text-muted-foreground">{viewOptions.find((option) => option.value === view)?.label} view · Change how this content appears.</p>
        </div>

        <PanelSection title="Content">
          <Select value={screenId} onValueChange={onScreenChange}>
            <SelectTrigger className="w-full" aria-label="Select content">
              <SelectValue />
            </SelectTrigger>
            <PanelSelectContent>
              {screens.map((screen) => (
                <SelectItem key={screen.id} value={screen.id}>{screen.name}</SelectItem>
              ))}
            </PanelSelectContent>
          </Select>
          <Select
            value={composition === 'flow' || composition === 'grid' ? 'collection' : 'single'}
            onValueChange={(value) => onCompositionChange(value === 'collection' ? 'flow' : 'single')}
          >
            <SelectTrigger className="w-full" aria-label="Select content type">
              <SelectValue />
            </SelectTrigger>
            <PanelSelectContent>
              <SelectItem value="single">Single screen</SelectItem>
              <SelectItem value="collection">Screen collection</SelectItem>
            </PanelSelectContent>
          </Select>
        </PanelSection>

        <PanelSection title="Composition">
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Composition layout">
            {compositionOptions.map(({ value, label, icon: Icon }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={composition === value}
                    className={cn(
                      'flex h-10 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      composition === value
                        ? 'border-ring bg-accent text-foreground'
                        : 'border-line-soft bg-(color:--chip) text-muted-foreground hover:border-line-strong hover:text-foreground',
                    )}
                    onClick={() => onCompositionChange(value)}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </PanelSection>

        <PanelSection title="Device">
          <SegmentedControl
            ariaLabel="Presentation viewport"
            options={viewportOptions}
            value={viewport}
            onChange={onViewportChange}
          />
          <Select value={deviceName} onValueChange={onDeviceChange}>
            <SelectTrigger className="w-full" aria-label="Select device frame">
              <SelectValue placeholder="No device frame" />
            </SelectTrigger>
            <PanelSelectContent>
              <SelectItem value="none">No device frame</SelectItem>
              {deviceGroups.map((group) => group.devices.map((device) => (
                <SelectItem key={`${group.group}:${device.name}`} value={device.name}>
                  {device.name} · {device.width}×{device.height}
                </SelectItem>
              )))}
            </PanelSelectContent>
          </Select>
        </PanelSection>

        <PanelSection title="Canvas">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Background</span>
            <input
              type="color"
              aria-label="Choose background color"
              className="h-8 w-11 cursor-pointer rounded border border-line-strong bg-transparent p-1"
              value={background}
              onChange={(event) => onBackgroundChange(event.target.value)}
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Scale</span>
            <Select value={scale} onValueChange={(value) => onScaleChange(value as PresentationScale)}>
              <SelectTrigger className="w-32" aria-label="Select scale"><SelectValue /></SelectTrigger>
              <PanelSelectContent>
                <SelectItem value="fit">Fit</SelectItem>
                {PRESENTATION_ZOOM_LEVELS.map((zoom) => (
                  <SelectItem key={zoom} value={String(zoom)}>{zoom * 100}%</SelectItem>
                ))}
              </PanelSelectContent>
            </Select>
          </label>
          <SettingSwitch label="Device frame" checked={showDeviceFrame} onCheckedChange={onShowDeviceFrameChange} />
          <SettingSwitch label="Screen label" checked={showScreenLabel} onCheckedChange={onShowScreenLabelChange} />
        </PanelSection>

        <Button type="button" variant="outline" className="w-full" onClick={onReset}>
          Reset presentation
        </Button>
      </div>
    </aside>
  );
}

function PanelSelectContent({ children }: { children: ReactNode }) {
  return (
    <SelectContent
      position="popper"
      side="left"
      align="start"
      sideOffset={12}
      collisionPadding={16}
      className="max-h-80 w-72 max-w-[calc(100vw-2rem)] [&_[data-position=popper]]:h-auto [&_[data-position=popper]]:min-w-0 [&_[data-position=popper]]:p-1"
    >
      {children}
    </SelectContent>
  );
}

function PanelSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function SegmentedControl<T extends string>({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  value: T;
}) {
  return (
    <div className="grid auto-cols-fr grid-flow-col rounded-lg border border-line-soft bg-(color:--chip) p-1" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            'rounded-md px-2 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === option.value ? 'bg-accent text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SettingSwitch({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={`Show ${label.toLowerCase()}`} />
    </label>
  );
}
