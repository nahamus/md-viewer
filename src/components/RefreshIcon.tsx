interface Props {
  className?: string;
}

/** A small circular-arrow refresh glyph, matching ChevronIcon's minimal stroke style. */
export function RefreshIcon({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.65 8A5.65 5.65 0 1 1 11.9 4" />
      <path d="M14 2.5v3.3h-3.3" />
    </svg>
  );
}
