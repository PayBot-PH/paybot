/**
 * Responsive design utilities for xend
 * Provides consistent breakpoints and responsive classNames across the app
 */

export const BREAKPOINTS = {
  xs: 320,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/**
 * Responsive padding helpers
 * Adjusts padding based on screen size
 */
export const responsivePadding = {
  container: 'px-4 md:px-6 lg:px-8',
  card: 'p-3 md:p-4 lg:p-5',
  section: 'py-6 md:py-8 lg:py-12',
  tight: 'p-2 md:p-3',
} as const;

/**
 * Responsive gap helpers
 */
export const responsiveGap = {
  compact: 'gap-2 md:gap-3 lg:gap-4',
  default: 'gap-3 md:gap-4 lg:gap-6',
  loose: 'gap-4 md:gap-6 lg:gap-8',
} as const;

/**
 * Responsive grid layouts
 */
export const responsiveGrid = {
  cols1: 'grid-cols-1',
  cols2: 'grid-cols-1 md:grid-cols-2',
  cols3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  cols4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
} as const;

/**
 * Responsive text sizes
 */
export const responsiveText = {
  h1: 'text-3xl md:text-4xl lg:text-5xl',
  h2: 'text-2xl md:text-3xl lg:text-4xl',
  h3: 'text-xl md:text-2xl lg:text-3xl',
  h4: 'text-lg md:text-xl lg:text-2xl',
  body: 'text-sm md:text-base lg:text-lg',
  small: 'text-xs md:text-sm',
} as const;

/**
 * Responsive height helpers
 */
export const responsiveHeight = {
  header: 'h-16 md:h-20',
  button: 'h-10 md:h-11 lg:h-12',
  input: 'h-10 md:h-11',
} as const;

/**
 * Mobile-first max-width container
 */
export const responsiveContainer = 'w-full max-w-sm sm:max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-6xl 2xl:max-w-7xl';
