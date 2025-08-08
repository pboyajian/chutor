import React, { useState } from 'react'
import type { AnalysisSummary } from '../lib/analysis'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
} from 'recharts'

const COLORS = ['#ef4444', '#f59e0b', '#60a5fa']

type ChartView = 'pie' | 'bar'

export default function Dashboard({ summary }: { summary: AnalysisSummary }) {
  const [view, setView] = useState<ChartView>('pie')
  const pieData = [
    { name: 'Blunders', value: summary.total.blunders },
    { name: 'Mistakes', value: summary.total.mistakes },
    { name: 'Inaccuracies', value: summary.total.inaccuracies },
  ]

  const topOpeningBlunders = Object.entries(summary.blundersByOpening)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([opening, count]) => ({ opening, count }))

  return (
    <div className="mt-8">
      <div className="mb-4 inline-flex rounded-md shadow-sm" role="tablist" aria-label="Chart view">
        <button
          type="button"
          onClick={() => setView('pie')}
          className={`px-4 py-2 text-sm font-medium border border-gray-300 rounded-l-md ${
            view === 'pie' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          role="tab"
          aria-selected={view === 'pie'}
        >
          Mistake Types
        </button>
        <button
          type="button"
          onClick={() => setView('bar')}
          className={`px-4 py-2 text-sm font-medium border border-gray-300 rounded-r-md -ml-px ${
            view === 'bar' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
          role="tab"
          aria-selected={view === 'bar'}
        >
          Top Blunder Openings
        </button>
      </div>

      {view === 'pie' && (
        <div className="rounded border border-gray-200 p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Mistake Type Distribution</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie dataKey="value" data={pieData} label>
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {view === 'bar' && (
        <div className="rounded border border-gray-200 p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Top 5 Openings with Most Blunders</h2>
          <div className="h-[28rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topOpeningBlunders} margin={{ top: 10, right: 20, left: 80, bottom: 100 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="opening"
                  tick={{ fontSize: 12 }}
                  interval={0}
                  angle={-35}
                  height={100}
                  tickMargin={12}
                  textAnchor="end"
                />
                <YAxis allowDecimals={false} />
                <RechartsTooltip />
                <Bar dataKey="count" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

