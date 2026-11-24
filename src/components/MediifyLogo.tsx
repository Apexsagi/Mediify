import React from 'react';

interface MediifyLogoProps {
  variant?: 'dark' | 'light';
  subtitle?: string;
  compact?: boolean;
}

export const MediifyLogo: React.FC<MediifyLogoProps> = ({
  variant = 'dark',
  subtitle = 'HEALTHCARE INTELLIGENCE',
  compact = false,
}) => {
  const titleColor = variant === 'light' ? 'text-white' : 'text-[#06152B]';
  const subColor = variant === 'light' ? 'text-slate-300' : 'text-[#64748B]';

  return (
    <span className="inline-flex items-center gap-2.5 select-none whitespace-nowrap">
      <svg
        width={compact ? 26 : 32}
        height={compact ? 26 : 32}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="mediifyCrossGrad" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="55%" stopColor="#0D9488" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <path
          d="M19 6C19 4.89543 19.8954 4 21 4H27C28.1046 4 29 4.89543 29 6V19H42C43.1046 19 44 19.8954 44 21V27C44 28.1046 43.1046 29 42 29H29V42C29 43.1046 28.1046 44 27 44H21C19.8954 44 19 43.1046 19 42V29H6C4.89543 29 4 28.1046 4 27V21C4 19.8954 4.89543 19 6 19H19V6Z"
          fill="url(#mediifyCrossGrad)"
        />
        <path
          d="M12 24.5H17.5L20.5 18L24.5 30.5L28 21.5L30.5 24.5H36"
          stroke={variant === 'light' ? '#06152B' : '#FFFFFF'}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span className={`font-display font-extrabold tracking-tight ${compact ? 'text-base' : 'text-lg'} ${titleColor}`}>
          MEDIIFY
        </span>
        {subtitle && !compact && (
          <span className={`font-mono text-[9px] font-semibold tracking-[0.16em] uppercase mt-0.5 ${subColor}`}>
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
};
