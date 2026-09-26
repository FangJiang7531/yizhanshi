import { Skeleton } from "@/components/feedback/empty-state";

/** 习惯打卡骨架屏：3 张卡片形状（图标位 + 两行文字 + 热力图位） */
export default function HabitsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-[var(--radius)]" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-9 w-28 rounded-[var(--radius)]" />
            <Skeleton className="h-16 w-52" />
          </div>
        ))}
      </div>
    </div>
  );
}
