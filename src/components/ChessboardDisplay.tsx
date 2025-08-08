import React from 'react'
import { Chessboard } from 'react-chessboard'

export default function ChessboardDisplay({
  fen,
  orientation = 'white',
  className = '',
}: {
  fen: string
  orientation?: 'white' | 'black'
  className?: string
}) {
  return (
    <div className={`w-full max-w-[560px] mx-auto ${className}`}>
      <Chessboard
        id="mistake-view-board"
        position={fen}
        boardWidth={Math.min(560, typeof window !== 'undefined' ? window.innerWidth - 64 : 560)}
        arePiecesDraggable={false}
        animationDuration={200}
        customBoardStyle={{ boxShadow: '0 6px 16px rgba(0,0,0,0.3)', borderRadius: 12 }}
        customDarkSquareStyle={{ backgroundColor: '#769656' }}
        customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
        boardOrientation={orientation}
      />
    </div>
  )
}

