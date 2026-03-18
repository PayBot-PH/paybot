import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconColor?: string;
  actions?: React.ReactNode;
  breadcrumb?: string[];
  className?: string;
}

export default function PageHeader({
  title,
  subtitle,
  icon,
  iconColor = 'bg-blue-500/15 text-blue-400',
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', iconColor)}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {breadcrumb && breadcrumb.length > 0 && (
            <p className="text-[11px] text-muted-foreground/70 mb-0.5 flex items-center gap-1">
              {breadcrumb.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="mx-0.5 opacity-50">/</span>}
                  <span>{crumb}</span>
                </React.Fragment>
              ))}
            </p>
          )}
          <h1 className="text-xl sm:text-2xl font-bold text-foreground bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
