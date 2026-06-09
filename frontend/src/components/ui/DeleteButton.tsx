import type { ButtonHTMLAttributes } from 'react';

interface DeleteButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** Required: icon-only button needs an accessible name for screen readers. */
  label: string;
  /** ghost = subtle in lists/rows (default); solid = filled danger for confirm actions. */
  variant?: 'ghost' | 'solid';
  /** sm = 32px (dense tables), md = 38px (default). */
  size?: 'sm' | 'md';
}

// On-brand animated delete button. Borrows the "trash-lid lifts on hover"
// micro-interaction from the community pattern, re-skinned to Billboy's danger
// vocabulary (no gradient/neon/glow), with the accessibility the original
// lacked: focus-visible ring, aria-label, and reduced-motion support.
export default function DeleteButton({
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...rest
}: DeleteButtonProps) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-[38px] w-[38px]';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]';
  const skin = variant === 'solid'
    ? 'bg-red-600 text-white border-transparent hover:bg-red-700'
    : 'bg-transparent text-red-500 border-transparent hover:bg-red-50 hover:text-red-700 hover:border-red-100';

  return (
    <button
      type="button"
      aria-label={label}
      title={rest.title ?? label}
      className={`group inline-flex items-center justify-center rounded-[10px] border ${box} ${skin} cursor-pointer transition-colors duration-200 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${className}`}
      {...rest}
    >
      <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <g className="origin-right transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:-rotate-12 motion-reduce:transition-none motion-reduce:group-hover:transform-none">
          <path d="M3 6h18" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </g>
        <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}
