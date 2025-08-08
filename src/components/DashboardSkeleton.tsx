import React from 'react'

export default function DashboardSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6 mb-6 animate-scale-in">
        <div className="h-6 w-48 skeleton mb-4" />
        <div className="h-80 w-full skeleton rounded-lg" />
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6 animate-scale-in">
        <div className="h-6 w-80 skeleton mb-4" />
        <div className="h-[30rem] w-full skeleton rounded-lg" />
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6 animate-fade-in-up">
          <div className="h-5 w-64 skeleton mb-3" />
          <ul className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="h-10 w-full skeleton" />
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6 animate-fade-in-up">
          <div className="h-[360px] w-full skeleton" />
        </div>
      </div>
    </div>
  )
}


