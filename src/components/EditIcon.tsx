interface Props {
  className?: string;
  size?: number;
}

/** A small pencil, matching ChevronIcon's minimal stroke style. */
export function EditIcon({ className, size = 14 }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 2.5l2.5 2.5L6 12.5l-3.5 1 1-3.5z" />
      <path d="M9.5 4l2.5 2.5" />
    </svg>
  );
}
