import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface SkeletonCardProps {
  /** Show icon placeholder on the right */
  withIcon?: boolean;
  /** Number of sub-lines beneath the value */
  lines?: number;
  className?: string;
}

export default function SkeletonCard({ withIcon = true, lines = 1, className }: SkeletonCardProps) {
  return (
    <div className={cn('stat-card p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-7 w-20 rounded" />
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-28 rounded" />
          ))}
        </div>
        {withIcon && (
          <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
        )}
      </div>
    </div>
  );
}
