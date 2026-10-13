/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Direction } from '../types';
import { motion } from 'motion/react';
import { Shield, Flame } from 'lucide-react';

interface TouchDpadProps {
  onDirectionPress: (dir: Direction | 'none') => void;
  onBombPress: () => void;
  onSpecialPress: () => void;
  specialLabel?: string;
}

export default function TouchDpad({
  onDirectionPress,
  onBombPress,
  onSpecialPress,
  specialLabel = 'E',
}: TouchDpadProps) {
  const [activeDir, setActiveDir] = useState<Direction | 'none'>('none');

  const handleTouchStart = (dir: Direction) => {
    setActiveDir(dir);
    onDirectionPress(dir);
  };

  const handleTouchEnd = () => {
    setActiveDir('none');
    onDirectionPress('none');
  };

  return (
    <div className="flex justify-between items-center w-full max-w-md mx-auto px-4 py-3 bg-neutral-100/80 backdrop-blur-md border border-neutral-200/50 rounded-2xl select-none md:hidden">
      {/* Direction Pad */}
      <div className="relative w-36 h-36 flex items-center justify-center">
        {/* Center Pad Block */}
        <div className="absolute w-12 h-12 bg-neutral-300 rounded-lg shadow-inner border border-neutral-400/40" />

        {/* UP Button */}
        <button
          className={`absolute top-0 w-12 h-14 bg-neutral-200 active:bg-neutral-400 border border-neutral-300 rounded-t-xl shadow flex items-center justify-center transition-colors`}
          style={{ minWidth: '44px', minHeight: '44px' }}
          onTouchStart={() => handleTouchStart('up')}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => handleTouchStart('up')}
          onMouseUp={handleTouchEnd}
          aria-label="Walk Up"
        >
          <svg className="w-6 h-6 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>

        {/* LEFT Button */}
        <button
          className={`absolute left-0 w-14 h-12 bg-neutral-200 active:bg-neutral-400 border border-neutral-300 rounded-l-xl shadow flex items-center justify-center transition-colors`}
          style={{ minWidth: '44px', minHeight: '44px' }}
          onTouchStart={() => handleTouchStart('left')}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => handleTouchStart('left')}
          onMouseUp={handleTouchEnd}
          aria-label="Walk Left"
        >
          <svg className="w-6 h-6 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* RIGHT Button */}
        <button
          className={`absolute right-0 w-14 h-12 bg-neutral-200 active:bg-neutral-400 border border-neutral-300 rounded-r-xl shadow flex items-center justify-center transition-colors`}
          style={{ minWidth: '44px', minHeight: '44px' }}
          onTouchStart={() => handleTouchStart('right')}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => handleTouchStart('right')}
          onMouseUp={handleTouchEnd}
          aria-label="Walk Right"
        >
          <svg className="w-6 h-6 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* DOWN Button */}
        <button
          className={`absolute bottom-0 w-12 h-14 bg-neutral-200 active:bg-neutral-400 border border-neutral-300 rounded-b-xl shadow flex items-center justify-center transition-colors`}
          style={{ minWidth: '44px', minHeight: '44px' }}
          onTouchStart={() => handleTouchStart('down')}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => handleTouchStart('down')}
          onMouseUp={handleTouchEnd}
          aria-label="Walk Down"
        >
          <svg className="w-6 h-6 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 items-center">
        {/* Special Ability Button */}
        <div className="flex flex-col items-center">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onSpecialPress}
            className="w-14 h-14 bg-amber-500 active:bg-amber-600 text-white rounded-full shadow-lg border border-amber-600/40 flex items-center justify-center flex-col focus:outline-none"
            style={{ minWidth: '48px', minHeight: '48px' }}
            aria-label="Activate Special Power"
          >
            <Shield className="w-5 h-5" />
            <span className="text-[10px] font-bold mt-0.5">{specialLabel}</span>
          </motion.button>
          <span className="text-[10px] text-neutral-500 font-bold mt-1">Especial</span>
        </div>

        {/* Bomb Button */}
        <div className="flex flex-col items-center">
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onBombPress}
            className="w-18 h-18 bg-red-600 active:bg-red-700 text-white rounded-full shadow-2xl border-2 border-red-700 flex items-center justify-center flex-col focus:outline-none"
            style={{ minWidth: '64px', minHeight: '64px' }}
            aria-label="Plant Bomb"
          >
            <Flame className="w-8 h-8 animate-pulse text-yellow-300" />
            <span className="text-xs font-black tracking-wider uppercase text-red-100">Bomb</span>
          </motion.button>
          <span className="text-[10px] text-neutral-500 font-bold mt-1">Plantar (Espaço)</span>
        </div>
      </div>
    </div>
  );
}
