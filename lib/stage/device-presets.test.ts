import { describe, expect, it } from 'vitest';
import { DEVICE_PRESET_GROUPS, breakpointForDevice, findDevice, type DevicePreset } from './device-presets';

const EXPECTED_GROUP_ORDER = ['Phone', 'Tablet', 'Desktop', 'Presentation', 'Watch', 'Paper', 'Social Media'];

describe('DEVICE_PRESET_GROUPS', () => {
  it('lists groups in the order the JSON gives them', () => {
    expect(DEVICE_PRESET_GROUPS.map((group) => group.group)).toEqual(EXPECTED_GROUP_ORDER);
  });

  it('has at least one group with at least one device', () => {
    expect(DEVICE_PRESET_GROUPS.length).toBeGreaterThan(0);
    expect(DEVICE_PRESET_GROUPS[0].devices.length).toBeGreaterThan(0);
  });

  it('gives every device a non-empty name, unique within its own group', () => {
    for (const group of DEVICE_PRESET_GROUPS) {
      const names = group.devices.map((device) => device.name);
      for (const name of names) {
        expect(name.length).toBeGreaterThan(0);
      }
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('gives every device a positive integer width and height', () => {
    for (const group of DEVICE_PRESET_GROUPS) {
      for (const device of group.devices) {
        expect(Number.isInteger(device.width)).toBe(true);
        expect(device.width).toBeGreaterThan(0);
        expect(Number.isInteger(device.height)).toBe(true);
        expect(device.height).toBeGreaterThan(0);
      }
    }
  });
});

describe('findDevice', () => {
  it('finds a device by its exact Figma label', () => {
    expect(findDevice('iPhone 16 & 17 Pro')).toEqual<DevicePreset>({
      name: 'iPhone 16 & 17 Pro',
      width: 402,
      height: 874,
    });
  });

  it('returns undefined for a name that matches no device', () => {
    expect(findDevice('Not a real device')).toBeUndefined();
  });
});

describe('breakpointForDevice', () => {
  it('maps a Phone-group device to the mobile segment', () => {
    expect(breakpointForDevice('iPhone 16 & 17 Pro')).toBe('mobile');
  });

  it('maps a Tablet-group device to the tablet segment', () => {
    expect(breakpointForDevice('iPad Pro 11"')).toBe('tablet');
  });

  it('maps a Desktop-group device to the desktop segment', () => {
    expect(breakpointForDevice('MacBook Air')).toBe('desktop');
  });

  it('has no matching segment for groups outside Phone, Tablet and Desktop', () => {
    expect(breakpointForDevice('A4')).toBeNull();
    expect(breakpointForDevice('Apple Watch Series 10 42mm')).toBeNull();
    expect(breakpointForDevice('Slide 16:9')).toBeNull();
    expect(breakpointForDevice('Instagram Post')).toBeNull();
  });

  it('returns null for a name that matches no device', () => {
    expect(breakpointForDevice('Not a real device')).toBeNull();
  });
});
