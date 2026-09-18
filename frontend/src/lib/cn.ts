// Join class names, skipping falsy values — keeps conditional Tailwind classes
// readable: cn('base', active && 'is-active').
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
