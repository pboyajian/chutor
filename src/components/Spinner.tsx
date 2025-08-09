import React from 'react'

export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-gray-200">
      <svg className="h-6 w-6 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
      </svg>
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}


