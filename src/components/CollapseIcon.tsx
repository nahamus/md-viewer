interface Props {
  className?: string;
  size?: number;
}

/** A box with a minus, matching ChevronIcon's minimal stroke style. */
export function CollapseIcon({ className, size = 14 }: Props) {
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
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M5 8h6" />
    </svg>
  );
}
