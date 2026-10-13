/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BomberMap, TileType, Vec2, BotArchetype } from '../types';
import { createRNG, randomChoice } from '../utils/rng';
import { compressMap, generateShareURL } from '../utils/lz';
import { saveCustomMap, getCustomMaps } from '../utils/db';
import { audio } from '../utils/audio';
import {
  Undo,
  Redo,
  Save,
  Share2,
  Trash2,
  Sparkles,
  ArrowLeft,
  Settings,
  Download,
  Upload,
  User,
  Activity,
  Grid,
  MapPin,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MapEditorProps {
  onBack: () => void;
  onPlayMap: (map: BomberMap) => void;
}

const DEFAULT_MAP_WIDTH = 15;
const DEFAULT_MAP_HEIGHT = 13;

const INITIAL_MAP: BomberMap = {
  version: 1,
  name: 'Arena custom',
  width: DEFAULT_MAP_WIDTH,
  height: DEFAULT_MAP_HEIGHT,
  tiles: Array(DEFAULT_MAP_HEIGHT).fill(null).map((_, y) =>
    Array(DEFAULT_MAP_WIDTH).fill(null).map((__, x) => {
      // Classic Bomberman solid grid pattern
      if (x === 0 || x === DEFAULT_MAP_WIDTH - 1 || y === 0 || y === DEFAULT_MAP_HEIGHT - 1) {
        return 'solid';
      }
      if (x % 2 === 0 && y % 2 === 0) {
        return 'solid';
      }
      return 'floor';
    })
  ),
  playerSpawn: { x: 1, y: 1 },
  enemySpawns: [
    { position: { x: DEFAULT_MAP_WIDTH - 2, y: DEFAULT_MAP_HEIGHT - 2 }, archetype: 'phantom', difficulty: 'normal' },
    { position: { x: DEFAULT_MAP_WIDTH - 2, y: 1 }, archetype: 'brute', difficulty: 'normal' },
    { position: { x: 1, y: DEFAULT_MAP_HEIGHT - 2 }, archetype: 'trickster', difficulty: 'normal' },
  ],
  powerUpConfig: {
    spawnChance: 0.35,
    weights: {
      blast_up: 20,
      bomb_up: 20,
      speed_up: 20,
      remote_bomb: 10,
      shield: 10,
      kick: 10,
      skate: 10,
    },
  },
  meta: {
    author: 'Criador',
    createdAt: new Date().toISOString(),
  },
};

type EditTool = 'floor' | 'solid' | 'destructible' | 'player_spawn' | 'enemy_spawn' | 'eraser' | 'fill';

export default function MapEditor({ onBack, onPlayMap }: MapEditorProps) {
  const [map, setMap] = useState<BomberMap>(JSON.parse(JSON.stringify(INITIAL_MAP)));
  const [activeTool, setActiveTool] = useState<EditTool>('solid');
  const [selectedBotArch, setSelectedBotArch] = useState<BotArchetype>('phantom');
  const [selectedBotDiff, setSelectedBotDiff] = useState<'easy' | 'normal' | 'hard'>('normal');

  const [seedInput, setSeedInput] = useState('');
  const [authorName, setAuthorName] = useState('Anônimo');
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [shareLink, setShareLink] = useState('');

  // Undo / Redo history
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Settings Panel State
  const [showSettings, setShowSettings] = useState(false);

  // Initialize history
  useEffect(() => {
    const serialized = JSON.stringify(map);
    setHistory([serialized]);
    setHistoryIndex(0);
  }, []);

  const pushHistory = (newMap: BomberMap) => {
    const serialized = JSON.stringify(newMap);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(serialized);
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      audio.playClick();
      const prevIndex = historyIndex - 1;
      const prevMap = JSON.parse(history[prevIndex]);
      setMap(prevMap);
      setHistoryIndex(prevIndex);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      audio.playClick();
      const nextIndex = historyIndex + 1;
      const nextMap = JSON.parse(history[nextIndex]);
      setMap(nextMap);
      setHistoryIndex(nextIndex);
    }
  };

  // Paint cell action
  const handleCellInteraction = (x: number, y: number) => {
    // Avoid drawing on outer walls
    if (x === 0 || x === map.width - 1 || y === 0 || y === map.height - 1) return;

    // Avoid drawing on standard grid pillars
    if (x % 2 === 0 && y % 2 === 0) return;

    const updated = JSON.parse(JSON.stringify(map)) as BomberMap;

    if (activeTool === 'eraser') {
      updated.tiles[y][x] = 'floor';
      // Remove enemy spawns at this cell
      updated.enemySpawns = updated.enemySpawns.filter(e => !(e.position.x === x && e.position.y === y));
    } else if (activeTool === 'solid' || activeTool === 'destructible' || activeTool === 'floor') {
      updated.tiles[y][x] = activeTool;
      // Remove any spawn conflicts
      if (updated.playerSpawn.x === x && updated.playerSpawn.y === y) {
        // can't have block on player spawn
      }
      updated.enemySpawns = updated.enemySpawns.filter(e => !(e.position.x === x && e.position.y === y));
    } else if (activeTool === 'player_spawn') {
      updated.tiles[y][x] = 'floor';
      updated.playerSpawn = { x, y };
      updated.enemySpawns = updated.enemySpawns.filter(e => !(e.position.x === x && e.position.y === y));
    } else if (activeTool === 'enemy_spawn') {
      updated.tiles[y][x] = 'floor';
      // Remove existing enemy spawn at cell
      const filtered = updated.enemySpawns.filter(e => !(e.position.x === x && e.position.y === y));
      if (filtered.length < 3) {
        filtered.push({
          position: { x, y },
          archetype: selectedBotArch,
          difficulty: selectedBotDiff,
        });
      }
      updated.enemySpawns = filtered;
    } else if (activeTool === 'fill') {
      const targetColor = updated.tiles[y][x];
      const replacementColor = 'solid'; // hardcoded to solid fill for simplicity
      if (targetColor !== replacementColor) {
        floodFill(updated, x, y, targetColor, replacementColor);
      }
    }

    setMap(updated);
    pushHistory(updated);
  };

  // Flood fill algorithm
  const floodFill = (
    currentMap: BomberMap,
    startX: number,
    startY: number,
    targetTile: TileType,
    replacementTile: TileType
  ) => {
    const queue: Vec2[] = [{ x: startX, y: startY }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const p = queue.shift()!;
      const key = `${p.x},${p.y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      // Check boundaries
      if (p.x <= 0 || p.x >= currentMap.width - 1 || p.y <= 0 || p.y >= currentMap.height - 1) continue;
      // Skip pillars
      if (p.x % 2 === 0 && p.y % 2 === 0) continue;

      if (currentMap.tiles[p.y][p.x] === targetTile) {
        currentMap.tiles[p.y][p.x] = replacementTile;

        // Push neighbors
        queue.push({ x: p.x + 1, y: p.y });
        queue.push({ x: p.x - 1, y: p.y });
        queue.push({ x: p.x, y: p.y + 1 });
        queue.push({ x: p.x, y: p.y - 1 });
      }
    }
  };

  // Generate procedural map from seed
  const generateProcedural = (customSeed?: string) => {
    audio.playClick();
    const seed = customSeed || Math.random().toString(36).substring(2, 9).toUpperCase();
    setSeedInput(seed);

    const rng = createRNG(seed);
    const updated = JSON.parse(JSON.stringify(INITIAL_MAP)) as BomberMap;
    updated.seed = seed;
    updated.name = `Seed: ${seed}`;

    for (let y = 1; y < updated.height - 1; y++) {
      for (let x = 1; x < updated.width - 1; x++) {
        // Pillars are solid
        if (x % 2 === 0 && y % 2 === 0) continue;

        // Avoid blocking player starting position
        const isPlayerSafeZone =
          (x === 1 && y === 1) ||
          (x === 1 && y === 2) ||
          (x === 2 && y === 1);
        if (isPlayerSafeZone) {
          updated.tiles[y][x] = 'floor';
          continue;
        }

        // Avoid blocking enemy zones initially
        const isEnemySafeZone = updated.enemySpawns.some(
          e => Math.abs(e.position.x - x) + Math.abs(e.position.y - y) <= 1
        );
        if (isEnemySafeZone) {
          updated.tiles[y][x] = 'floor';
          continue;
        }

        // Destructible block placement probability
        const val = rng();
        if (val < updated.powerUpConfig.spawnChance) {
          updated.tiles[y][x] = 'destructible';
        } else {
          updated.tiles[y][x] = 'floor';
        }
      }
    }

    setMap(updated);
    pushHistory(updated);
  };

  const handleSave = () => {
    audio.playPowerUp();
    const mapToSave = {
      ...map,
      meta: {
        author: authorName,
        createdAt: new Date().toISOString(),
      },
    };
    saveCustomMap(mapToSave);
    alert('Arena personalizada gravada com sucesso no dispositivo!');
  };

  const handleShare = () => {
    audio.playClick();
    const link = generateShareURL(map);
    setShareLink(link);
    navigator.clipboard.writeText(link);
  };

  // Export JSON file
  const handleExportJSON = () => {
    audio.playClick();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(map, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `bomberweb-map-${map.name.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import JSON file
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as BomberMap;
        if (imported.tiles && imported.width && imported.height) {
          setMap(imported);
          pushHistory(imported);
          audio.playPowerUp();
        } else {
          alert('Arquivo JSON inválido para mapa de BomberWeb.');
        }
      } catch (err) {
        alert('Falha ao parsear arquivo de mapa JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col min-h-screen bg-neutral-50 text-neutral-800 font-sans select-none pb-8">
      {/* Top bar */}
      <header className="flex justify-between items-center px-6 py-4 bg-white/95 border-b border-neutral-200/60 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              audio.playClick();
              onBack();
            }}
            className="p-2 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-xl transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-black text-neutral-900 tracking-tight flex items-center gap-1.5">
              <Grid className="w-5 h-5 text-amber-500" />
              Editor de Mapas
            </h1>
            <p className="text-xs text-neutral-500">Arraste para pintar e configure sua arena ideal</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 rounded-lg transition-all"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo className="w-5 h-5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 rounded-lg transition-all"
            title="Refazer (Ctrl+Y)"
          >
            <Redo className="w-5 h-5" />
          </button>
          <div className="h-6 w-[1px] bg-neutral-200 mx-1" />
          <button
            onClick={() => {
              audio.playClick();
              setShowSettings(true);
            }}
            className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-all flex items-center gap-1"
          >
            <Settings className="w-5 h-5" />
            <span className="text-xs font-bold hidden sm:inline">Configurar</span>
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Save className="w-4 h-4" />
            Salvar
          </button>
          <button
            onClick={() => {
              audio.playClick();
              onPlayMap(map);
            }}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs shadow-sm transition-all"
          >
            Testar Arena
          </button>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <div className="max-w-7xl mx-auto w-full px-6 grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6 flex-grow">
        {/* Left tools panel */}
        <div className="lg:col-span-1 flex flex-col gap-5 bg-white p-5 border border-neutral-200/50 rounded-2xl shadow-sm h-fit">
          <div>
            <h3 className="text-sm font-black text-neutral-900 uppercase tracking-wider mb-2">Ferramentas de Pintura</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { audio.playClick(); setActiveTool('solid'); }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 text-xs font-bold transition-all ${
                  activeTool === 'solid' ? 'bg-neutral-100 border-neutral-900 text-neutral-900' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'
                }`}
              >
                <div className="w-8 h-8 bg-neutral-700 border border-neutral-800 rounded-md mb-2 shadow-sm" />
                Bloco Sólido
              </button>
              <button
                onClick={() => { audio.playClick(); setActiveTool('destructible'); }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 text-xs font-bold transition-all ${
                  activeTool === 'destructible' ? 'bg-neutral-100 border-neutral-900 text-neutral-900' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'
                }`}
              >
                <div className="w-8 h-8 bg-amber-700/80 border border-amber-800 rounded-md mb-2 shadow-sm" />
                Destrutível
              </button>
              <button
                onClick={() => { audio.playClick(); setActiveTool('floor'); }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 text-xs font-bold transition-all ${
                  activeTool === 'floor' ? 'bg-neutral-100 border-neutral-900 text-neutral-900' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'
                }`}
              >
                <div className="w-8 h-8 bg-neutral-200 border border-neutral-300 rounded-md mb-2" />
                Piso Livre
              </button>
              <button
                onClick={() => { audio.playClick(); setActiveTool('eraser'); }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 text-xs font-bold transition-all ${
                  activeTool === 'eraser' ? 'bg-neutral-100 border-neutral-900 text-neutral-900' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'
                }`}
              >
                <div className="w-8 h-8 bg-red-100 border border-red-200 rounded-md flex items-center justify-center mb-2">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </div>
                Apagador
              </button>
            </div>
          </div>

          <div className="h-[1px] bg-neutral-100" />

          {/* Actor spawns */}
          <div>
            <h3 className="text-sm font-black text-neutral-900 uppercase tracking-wider mb-2">Pontos de Spawn</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { audio.playClick(); setActiveTool('player_spawn'); }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 text-xs font-bold transition-all ${
                  activeTool === 'player_spawn' ? 'bg-neutral-100 border-neutral-900 text-neutral-900' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'
                }`}
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mb-2 shadow border border-blue-600">
                  <User className="w-4 h-4 text-white" />
                </div>
                Spawn Player
              </button>

              <button
                onClick={() => { audio.playClick(); setActiveTool('enemy_spawn'); }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 text-xs font-bold transition-all ${
                  activeTool === 'enemy_spawn' ? 'bg-neutral-100 border-neutral-900 text-neutral-900' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'
                }`}
              >
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center mb-2 shadow border border-purple-600">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                Spawn Inimigo
              </button>
            </div>

            {/* If enemy spawn tool is active, show configuration details for the painted bot */}
            {activeTool === 'enemy_spawn' && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 bg-neutral-50 p-3 border border-neutral-200 rounded-xl flex flex-col gap-2"
              >
                <div>
                  <label className="text-[10px] font-black tracking-wider text-neutral-500 uppercase">Arquétipo do Bot</label>
                  <select
                    value={selectedBotArch}
                    onChange={(e) => setSelectedBotArch(e.target.value as BotArchetype)}
                    className="w-full text-xs bg-white border border-neutral-200 rounded p-1.5 mt-0.5 outline-none font-bold"
                  >
                    <option value="phantom">Phantom (Caçador roxo)</option>
                    <option value="brute">Brute (Demolidor laranja)</option>
                    <option value="trickster">Trickster (Remoto verde)</option>
                    <option value="sentinel">Sentinel (Estrategista azul)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black tracking-wider text-neutral-500 uppercase">Dificuldade</label>
                  <select
                    value={selectedBotDiff}
                    onChange={(e) => setSelectedBotDiff(e.target.value as any)}
                    className="w-full text-xs bg-white border border-neutral-200 rounded p-1.5 mt-0.5 outline-none font-bold"
                  >
                    <option value="easy">Fácil</option>
                    <option value="normal">Médio</option>
                    <option value="hard">Difícil</option>
                  </select>
                </div>
              </motion.div>
            )}
          </div>

          <div className="h-[1px] bg-neutral-100" />

          {/* Procedural seeded generators */}
          <div>
            <h3 className="text-sm font-black text-neutral-900 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Geração Seedada
            </h3>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Insira um seed (ex: ARENA77)"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 outline-none font-mono"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => generateProcedural(seedInput)}
                  className="flex-grow py-2 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-xs font-bold transition-all text-neutral-700"
                >
                  Gerar por Seed
                </button>
                <button
                  onClick={() => generateProcedural()}
                  className="py-2 px-3 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl text-xs font-bold transition-all"
                  title="Aleatório"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Center Grid Workspace */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="bg-white border border-neutral-200/50 p-6 rounded-2xl shadow-sm flex flex-col items-center justify-center overflow-auto min-h-[450px]">
            {/* Playable Map Grid Visualized */}
            <div
              className="grid gap-[1px] bg-neutral-300 p-1 rounded-xl shadow-inner select-none relative"
              style={{
                gridTemplateColumns: `repeat(${map.width}, minmax(0, 1fr))`,
                maxWidth: '100%',
              }}
              onMouseDown={() => setIsMouseDown(true)}
              onMouseUp={() => setIsMouseDown(false)}
              onMouseLeave={() => setIsMouseDown(false)}
            >
              {map.tiles.map((row, y) =>
                row.map((tile, x) => {
                  const isOuterWall = x === 0 || x === map.width - 1 || y === 0 || y === map.height - 1;
                  const isPillar = x % 2 === 0 && y % 2 === 0;

                  // Determine colors based on cell types
                  let bgClass = 'bg-neutral-100';
                  let borderClass = 'border-neutral-200/40';

                  if (isOuterWall || isPillar) {
                    bgClass = 'bg-neutral-800 shadow-inner pattern-grid';
                    borderClass = 'border-neutral-950/40';
                  } else if (tile === 'solid') {
                    bgClass = 'bg-neutral-700 border-neutral-800 shadow';
                  } else if (tile === 'destructible') {
                    bgClass = 'bg-amber-800/80 border-amber-900 shadow-sm';
                  }

                  const isPlayer = map.playerSpawn.x === x && map.playerSpawn.y === y;
                  const botSpawn = map.enemySpawns.find(e => e.position.x === x && e.position.y === y);

                  return (
                    <div
                      key={`${x}-${y}`}
                      onMouseDown={() => handleCellInteraction(x, y)}
                      onMouseEnter={() => {
                        if (isMouseDown) handleCellInteraction(x, y);
                      }}
                      className={`w-8 h-8 md:w-11 md:h-11 border ${borderClass} ${bgClass} rounded-sm cursor-crosshair relative flex items-center justify-center transition-all duration-75`}
                    >
                      {/* Player Spawn Visual */}
                      {isPlayer && (
                        <motion.div
                          layoutId="playerSpawn"
                          className="absolute w-5 h-5 md:w-7 md:h-7 bg-blue-500 rounded-full border-2 border-white shadow-md flex items-center justify-center"
                        >
                          <User className="w-3 h-3 text-white" />
                        </motion.div>
                      )}

                      {/* Bot Spawn Visuals */}
                      {botSpawn && (
                        <div
                          className={`absolute w-5 h-5 md:w-7 md:h-7 rounded-full border-2 border-white shadow-md flex items-center justify-center ${
                            botSpawn.archetype === 'phantom'
                              ? 'bg-purple-600'
                              : botSpawn.archetype === 'brute'
                              ? 'bg-orange-600'
                              : botSpawn.archetype === 'trickster'
                              ? 'bg-green-600'
                              : 'bg-cyan-600'
                          }`}
                        >
                          <Bot className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex gap-4 mt-4 text-[11px] text-neutral-400 font-bold">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-neutral-800 rounded" /> Borda Inviolável</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-neutral-700 rounded" /> Bloco Indestrutível</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-800/80 rounded" /> Destrutível</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-full" /> Spawn Player</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-500 rounded-full" /> Spawn Inimigo</span>
            </div>
          </div>

          {/* Social share widget */}
          <div className="bg-white border border-neutral-200/50 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 rounded-xl text-amber-700">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-neutral-900 leading-tight">Compartilhe sua Arena</h4>
                <p className="text-xs text-neutral-500">Qualquer um pode jogar seu mapa diretamente pela URL</p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={handleShare}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs rounded-xl flex items-center gap-1.5 w-full md:w-auto transition-all justify-center"
              >
                Copiar URL do Mapa
              </button>
              <button
                onClick={handleExportJSON}
                className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition-all"
                title="Exportar JSON"
              >
                <Download className="w-4 h-4" />
              </button>
              <label className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl border border-neutral-200 transition-all cursor-pointer">
                <Upload className="w-4 h-4" />
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJSON}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {shareLink && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border border-green-200 p-3 rounded-xl text-xs flex justify-between items-center text-green-800 font-mono overflow-x-auto gap-2"
            >
              <span className="truncate max-w-[85%]">{shareLink}</span>
              <span className="text-[10px] uppercase font-black tracking-wider bg-green-200 text-green-900 px-2 py-0.5 rounded">Copiado!</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Settings Modal (Overlay) */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-neutral-200/50"
            >
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-100">
                <h2 className="text-lg font-black text-neutral-900">Configurações da Arena</h2>
                <button
                  onClick={() => {
                    audio.playClick();
                    setShowSettings(false);
                  }}
                  className="text-neutral-400 hover:text-neutral-700 font-bold text-sm"
                >
                  Fechar
                </button>
              </div>

              <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-1">
                <div>
                  <label className="text-xs font-black text-neutral-700 block mb-1">Nome da Arena</label>
                  <input
                    type="text"
                    value={map.name}
                    onChange={(e) => setMap({ ...map, name: e.target.value })}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-xs outline-none font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black text-neutral-700 block mb-1">Autor</label>
                    <input
                      type="text"
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-xs outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-neutral-700 block mb-1">Sudden Death (Segundos)</label>
                    <input
                      type="number"
                      value={map.suddenDeathSeconds || ''}
                      placeholder="Sem limite"
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value) : undefined;
                        setMap({ ...map, suddenDeathSeconds: val });
                      }}
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-xs outline-none font-bold"
                    />
                  </div>
                </div>

                <div className="h-[1px] bg-neutral-100 my-1" />

                <div>
                  <label className="text-xs font-black text-neutral-700 block mb-1">
                    Chance de Spawn de Item por Bloco Destruído ({(map.powerUpConfig.spawnChance * 100).toFixed(0)}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={map.powerUpConfig.spawnChance}
                    onChange={(e) => {
                      const updated = { ...map };
                      updated.powerUpConfig.spawnChance = parseFloat(e.target.value);
                      setMap(updated);
                    }}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-neutral-700 block mb-2">Frequência Relativa de Powerups</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(map.powerUpConfig.weights).map(([item, weight]) => (
                      <div key={item} className="flex justify-between items-center bg-neutral-50 p-2 border border-neutral-100 rounded-lg">
                        <span className="font-bold capitalize text-[11px]">
                          {item.replace('_', ' ')}
                        </span>
                        <input
                          type="number"
                          value={weight}
                          onChange={(e) => {
                            const updated = { ...map };
                            updated.powerUpConfig.weights = {
                              ...updated.powerUpConfig.weights,
                              [item]: parseInt(e.target.value) || 0,
                            };
                            setMap(updated);
                          }}
                          className="w-12 bg-white border border-neutral-200 rounded p-1 text-center font-bold font-mono text-xs outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    audio.playPowerUp();
                    setShowSettings(false);
                    pushHistory(map);
                  }}
                  className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Confirmar Ajustes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
