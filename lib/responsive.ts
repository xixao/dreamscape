export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export type Responsive<T> = { mobile: T; tablet?: T; desktop?: T };

export const BREAKPOINTS: readonly Breakpoint[] = ['mobile', 'tablet', 'desktop'];

export const BREAKPOINT_MD = 768;

export function breakpointForWidth(width: number): Breakpoint {
  return width < BREAKPOINT_MD ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
}

export function isResponsive<T>(value: unknown): value is Responsive<T> {
  return typeof value === 'object' && value !== null && 'mobile' in value;
}

export function resolve<T>(value: Responsive<T> | T, breakpoint: Breakpoint): T {
  if (isResponsive<T>(value)) {
    // Legacy layouts used desktop from 768px; preserve them when tablet is absent.
    return value[breakpoint] ?? (breakpoint === 'tablet' ? value.desktop : undefined) ?? value.mobile;
  }
  return value;
}

export function otherBreakpoint(breakpoint: Breakpoint): Breakpoint {
  return breakpoint === 'mobile' ? 'desktop' : 'mobile';
}
