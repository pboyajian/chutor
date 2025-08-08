import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="p-8 text-center">
      <div>
        <a href="https://vite.dev" target="_blank" rel="noreferrer">
          <img src={viteLogo} className="inline-block h-16" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer" className="ml-4">
          <img src={reactLogo} className="inline-block h-16" alt="React logo" />
        </a>
      </div>
      <h1 className="text-3xl font-bold my-6">Vite + React + TS</h1>
      <div>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded"
          onClick={() => setCount((c) => c + 1)}
        >
          count is {count}
        </button>
      </div>
      <p className="mt-6 text-gray-500">Edit src/App.tsx and save to test HMR</p>
    </div>
  )
}

