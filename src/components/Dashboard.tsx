import React from 'react'
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

export default function Dashboard({ summary }: { summary: AnalysisSummary }) {
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
    <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
      <div className="rounded border border-gray-200 p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Mistake Type Distribution</h2>
        <div className="h-64">
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

      <div className="rounded border border-gray-200 p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Top 5 Openings with Most Blunders</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topOpeningBlunders} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="opening" tick={{ fontSize: 12 }} interval={0} angle={-20} height={50} dy={10} />
              <YAxis allowDecimals={false} />
              <RechartsTooltip />
              <Bar dataKey="count" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

