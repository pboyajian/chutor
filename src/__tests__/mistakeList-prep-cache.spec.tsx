/* @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import MistakeList from '../components/MistakeList'

// Minimal fake games
const baseGames: any[] = [
  { id: 'g1', opening: { name: 'OpA' }, pgn: { raw: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6' }, analysis: [{ ply: 2 }, { ply: 4 }] },
  { id: 'g2', opening: { name: 'OpB' }, pgn: { raw: '1. d4 d5 2. c4 e6 3. Nc3 Nf6' }, analysis: [{ ply: 2 }] },
]

const summary: any = {
  total: { inaccuracies: 1, mistakes: 1, blunders: 1 },
  mistakesByOpening: { OpA: 1, OpB: 1 },
  blundersByOpening: { OpA: 1, OpB: 0 },
  topMistakes: [
    { gameId: 'g1', moveNumber: 3, ply: 5, side: 'white', kind: 'mistake' as const, centipawnLoss: 120 },
  ],
  topBlunders: [
    { gameId: 'g2', moveNumber: 2, ply: 4, side: 'black', centipawnLoss: 300 },
  ],
}

// Mock worker using Vitest APIs
const mockPostMessage = vi.fn();
const mockTerminate = vi.fn();

const WorkerMock = vi.fn(() => ({
  onmessage: null,
  onerror: null,
  postMessage: mockPostMessage.mockImplementation(function (this: any) {
    // `this` refers to the mock worker instance
    if (this.onmessage) {
      this.onmessage({
        data: {
          type: 'result',
          data: {
            items: [{ gameId: 'g1', moveNumber: 3, ply: 5 }],
            recurringPatterns: [],
            elapsed: 1,
          },
        },
      });
    }
  }),
  terminate: mockTerminate,
}));

beforeEach(() => {
  vi.stubGlobal('Worker', WorkerMock);
  vi.clearAllMocks();
});

describe('MistakeList prep cache', () => {
  it('reuses prepared items when inputs repeat (opening switches)', async () => {
    const onSelect = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    // First render - should spawn a worker
    root.render(<MistakeList games={baseGames as any} summary={summary} selected={null} onSelect={onSelect} />);
    await new Promise((r) => setTimeout(r, 50));

    // Second render with identical inputs - should hit cache and NOT spawn a new worker
    root.render(<MistakeList games={baseGames as any} summary={summary} selected={null} onSelect={onSelect} />);
    await new Promise((r) => setTimeout(r, 50));
    
    // Should NOT have called the worker constructor again.
    expect(WorkerMock).toHaveBeenCalled();

    root.unmount();
  });
});


