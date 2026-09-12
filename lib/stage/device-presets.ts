import type { StagePreset } from '@/lib/stage';
import deviceGroupsJson from './device-presets.json';

export type DevicePreset = {
  name: string;
  width: number;
  height: number;
};

export type DevicePresetGroup = {
  group: string;
  devices: DevicePreset[];
};

// The JSON is Figma's own device preset list (Frame tool, right sidebar),
// grouped and ordered exactly as Figma shows it - see
// docs/research/2026-09-12-figma-device-presets.md. Typed here rather than
// imported ad hoc so every consumer (the top bar's menu, tests) shares one
// shape.
export const DEVICE_PRESET_GROUPS: DevicePresetGroup[] = deviceGroupsJson as DevicePresetGroup[];

/**
 * Finds a device preset by its exact Figma label (unique within its own
 * group, not necessarily across groups). Undefined when no group has a
 * device by that name.
 */
export function findDevice(name: string): DevicePreset | undefined {
  for (const group of DEVICE_PRESET_GROUPS) {
    const found = group.devices.find((device) => device.name === name);
    if (found) return found;
  }
  return undefined;
}

function groupForDevice(name: string): string | undefined {
  return DEVICE_PRESET_GROUPS.find((group) => group.devices.some((device) => device.name === name))?.group;
}

// Only Phone, Tablet and Desktop devices correspond to one of the top bar's
// three Mobile/Tablet/Desktop segments - Presentation, Watch, Paper and
// Social Media devices are real sizes but not web breakpoints, so choosing
// one leaves none of the three segments highlighted.
const GROUP_TO_STAGE_PRESET: Partial<Record<string, StagePreset>> = {
  Phone: 'mobile',
  Tablet: 'tablet',
  Desktop: 'desktop',
};

/**
 * Which Mobile/Tablet/Desktop segment (if any) a device preset corresponds
 * to, by its Figma group rather than its exact pixel width - so a device
 * whose width does not exactly equal 375/768/1440 still lights up the
 * segment that best describes it. Null for an unknown device or one whose
 * group has no corresponding segment.
 */
export function breakpointForDevice(name: string): StagePreset | null {
  const group = groupForDevice(name);
  if (group === undefined) return null;
  return GROUP_TO_STAGE_PRESET[group] ?? null;
}
