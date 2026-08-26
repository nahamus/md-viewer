interface Props {
  className?: string;
}

/** A small right-pointing chevron — rotates via the .chevron--open CSS class. */
export function ChevronIcon({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}
