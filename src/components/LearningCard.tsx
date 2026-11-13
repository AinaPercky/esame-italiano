import React from 'react';

export type StatusTone = 'live' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export interface LearningMetricItem {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'success' | 'danger' | 'accent';
}

interface LearningCardProps {
  children: React.ReactNode;
  active?: boolean;
  interactive?: boolean;
  asButton?: boolean;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}

export const LearningCard: React.FC<LearningCardProps> = ({
  children,
  active = false,
  interactive = false,
  asButton = false,
  onClick,
  className = '',
  ariaLabel
}) => {
  const classes = [
    'pk-card',
    active ? 'is-active' : '',
    interactive || asButton ? 'is-interactive' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  if (asButton) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`${classes} text-left`}
      >
        {active && <span className="pk-card-accent" aria-hidden="true" />}
        <div className="pk-card-body">{children}</div>
      </button>
    );
  }

  return (
    <article className={classes}>
      {active && <span className="pk-card-accent" aria-hidden="true" />}
      <div className="pk-card-body">{children}</div>
    </article>
  );
};

interface StatusBadgeProps {
  tone?: StatusTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  className?: string;
}

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  live: 'border-[#9ed9b9] bg-[#eaf7f0] text-[#145c3d]',
  success: 'border-[#bfe3ce] bg-[#eef9f3] text-[#17613e]',
  info: 'border-[#c6dced] bg-[#edf5fa] text-[#0b3c5d]',
  warning: 'border-[#eed9aa] bg-[#fef9ec] text-[#8a5108]',
  danger: 'border-[#f3c5cc] bg-[#fef2f4] text-[#9f1239]',
  neutral: 'border-[#dde7ee] bg-[#f5f8fa] text-[#4c697c]'
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone = 'neutral',
  icon,
  children,
  title,
  className = ''
}) => (
  <span
    title={title}
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold leading-none whitespace-nowrap ${STATUS_TONE_CLASSES[tone]} ${className}`}
  >
    {icon && <span className="inline-flex shrink-0 items-center" aria-hidden="true">{icon}</span>}
    <span>{children}</span>
  </span>
);

interface LearningCardHeaderProps {
  kicker: React.ReactNode;
  status?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const LearningCardHeader: React.FC<LearningCardHeaderProps> = ({
  kicker,
  status,
  icon,
  className = ''
}) => (
  <div className={`flex flex-wrap items-center justify-between gap-2 ${className}`}>
    <div className="flex min-w-0 items-center gap-2">
      {icon && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#edf5fa] text-[#0b3c5d]" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0 truncate text-[11px] font-extrabold uppercase tracking-[0.07em] text-[#0b3c5d]">
        {kicker}
      </div>
    </div>
    {status && <div className="shrink-0">{status}</div>}
  </div>
);

interface LearningCardMetricsProps {
  items: LearningMetricItem[];
  columns?: 2 | 3;
  className?: string;
}

const METRIC_VALUE_TONE: Record<NonNullable<LearningMetricItem['tone']>, string> = {
  default: 'text-[#072a3f]',
  success: 'text-[#145c3d]',
  danger: 'text-[#9f1239]',
  accent: 'text-[#0b3c5d]'
};

export const LearningCardMetrics: React.FC<LearningCardMetricsProps> = ({
  items,
  columns,
  className = ''
}) => {
  const colCount = columns ?? (items.length >= 3 ? 3 : 2);
  const gridColsClass =
    colCount === 3
      ? 'grid-cols-3'
      : 'grid-cols-2';

  return (
    <div
      className={`grid ${gridColsClass} divide-x divide-[#e5eff5] rounded-xl border border-[#e5eff5] bg-[#f7fafc] ${className}`}
    >
      {items.map((item, idx) => (
        <div key={idx} className="min-w-0 px-3 py-2.5">
          <div className="truncate text-[10px] font-bold uppercase tracking-[0.06em] text-[#607f93]">
            {item.label}
          </div>
          <div
            className={`mt-0.5 truncate text-sm font-extrabold tabular-nums sm:text-[15px] ${
              METRIC_VALUE_TONE[item.tone || 'default']
            }`}
          >
            {item.value}
          </div>
          {item.hint && (
            <div className="mt-0.5 truncate text-[10px] font-medium text-[#607f93]">
              {item.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

interface LearningCardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const LearningCardFooter: React.FC<LearningCardFooterProps> = ({
  children,
  className = ''
}) => (
  <div className={`mt-auto flex flex-col gap-2 border-t border-[#eaf1f6] pt-3.5 ${className}`}>
    {children}
  </div>
);

interface LearningModuleHeaderProps {
  kicker: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}

export const LearningModuleHeader: React.FC<LearningModuleHeaderProps> = ({
  kicker,
  title,
  description,
  action,
  aside,
  className = ''
}) => (
  <header className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
    <div className="min-w-0">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#2fa36b]">
        {kicker}
      </p>
      <h1 className="mt-0.5 font-display text-xl font-black tracking-tight text-[#072a3f] sm:text-2xl">
        {title}
      </h1>
      {description && (
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#46657a] sm:text-sm">
          {description}
        </p>
      )}
    </div>
    {(action || aside) && (
      <div className="shrink-0">{aside || action}</div>
    )}
  </header>
);
