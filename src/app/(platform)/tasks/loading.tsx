import { Skeleton } from "@/components/feedback/empty-state";

/** 任务清单骨架屏：与真实列表行同形状（禁止整页 Spinner 遮罩） */
export default function TasksLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 flex-1 sm:max-w-xs" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-9 w-56" />
      <div className="card divide-y overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="h-5 w-5 rounded-[5px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="hidden h-4 w-14 sm:block" />
            <Skeleton className="hidden h-5 w-10 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
