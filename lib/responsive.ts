export type Breakpoint = 'mobile' | 'desktop';

export type Responsive<T> = { mobile: T; desktop?: T };

export const BREAKPOINTS: readonly Breakpoint[] = ['mobile', 'desktop'];

export const BREAKPOINT_MD = 768;

export function breakpointForWidth(width: number): Breakpoint {
  return width < BREAKPOINT_MD ? 'mobile' : 'desktop';
}

export function isResponsive<T>(value: unknown): value is Responsive<T> {
  return typeof value === 'object' && value !== null && 'mobile' in value;
}

export function resolve<T>(value: Responsive<T> | T, breakpoint: Breakpoint): T {
  if (isResponsive<T>(value)) {
    return value[breakpoint] ?? value.mobile;
  }
  return value;
}

export function otherBreakpoint(breakpoint: Breakpoint): Breakpoint {
  return breakpoint === 'mobile' ? 'desktop' : 'mobile';
}
