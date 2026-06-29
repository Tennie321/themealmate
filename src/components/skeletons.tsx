import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className="bg-card rounded-3xl p-5 border border-border">
        <div className="flex items-center justify-around">
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-24 w-24 rounded-full" />
            <Skeleton className="h-3 w-14" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-24 w-24 rounded-full" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-card rounded-3xl p-4 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-14 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ShoppingSkeleton() {
  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <Skeleton className="h-20 w-full rounded-2xl" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="bg-card rounded-2xl p-3 border border-border space-y-3">
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-card rounded-3xl p-4 border border-border space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProgressSkeleton() {
  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <Skeleton className="h-40 w-full rounded-3xl" />
      <Skeleton className="h-56 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-3xl" />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}