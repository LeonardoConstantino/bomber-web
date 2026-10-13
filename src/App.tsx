/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import MainMenu from './components/MainMenu';
import GameCanvas from './components/GameCanvas';
import MapEditor from './components/MapEditor';
import { BomberMap } from './types';
import { decompressMap } from './utils/lz';
import { audio } from './utils/audio';

type Screen = 'menu' | 'game' | 'editor';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('menu');
  const [selectedMap, setSelectedMap] = useState<BomberMap | null>(null);
  const [playAgainstGhost, setPlayAgainstGhost] = useState(false);
  const [watchOnly, setWatchOnly] = useState(false);

  // Parse shared URLs on initialization
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const mParam = urlParams.get('m');
      
      if (mParam) {
        const decompressed = decompressMap(mParam);
        if (decompressed) {
          setSelectedMap(decompressed);
          // If the shared map contains a ghost recording, prompt to play against it!
          if (decompressed.ghost) {
            setPlayAgainstGhost(true);
          }
          setCurrentScreen('game');
        }
      }
    } catch (err) {
      console.error('Failed to parse URL shared parameters:', err);
    }
  }, []);

  const handleStartGame = (map: BomberMap, vsGhost: boolean, spectator: boolean) => {
    setSelectedMap(map);
    setPlayAgainstGhost(vsGhost);
    setWatchOnly(spectator);
    setCurrentScreen('game');
  };

  const handleOpenEditor = () => {
    setCurrentScreen('editor');
  };

  const handleBackToMenu = () => {
    // Clear URL parameters to restore original clean address state
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    setSelectedMap(null);
    setPlayAgainstGhost(false);
    setWatchOnly(false);
    setCurrentScreen('menu');
  };

  return (
    <div className="min-h-screen bg-neutral-50 selection:bg-amber-100 selection:text-amber-900">
      {currentScreen === 'menu' && (
        <MainMenu
          onStartGame={handleStartGame}
          onOpenEditor={handleOpenEditor}
        />
      )}

      {currentScreen === 'game' && selectedMap && (
        <GameCanvas
          map={selectedMap}
          playAgainstGhost={playAgainstGhost}
          watchOnly={watchOnly}
          onBack={handleBackToMenu}
        />
      )}

      {currentScreen === 'editor' && (
        <MapEditor
          onBack={handleBackToMenu}
          onPlayMap={(map) => handleStartGame(map, false, false)}
        />
      )}
    </div>
  );
}
