'use client'

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-4 w-12" />
      </div>
      <div className="skeleton h-3 w-1/2 mt-2" />
    </div>
  )
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
