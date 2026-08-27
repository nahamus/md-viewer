interface Props {
  className?: string;
  size?: number;
}

/** A small magnifying glass, matching ChevronIcon's minimal stroke style. */
export function SearchIcon({ className, size = 14 }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6.75" cy="6.75" r="4.25" />
      <path d="M13.5 13.5l-3.4-3.4" />
    </svg>
  );
}
