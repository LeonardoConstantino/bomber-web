/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BomberMap, PersonalRecord } from '../types';
import { getCustomMaps, getPersonalRecords, saveCustomMap } from '../utils/db';
import { decompressMap } from '../utils/lz';
import { audio } from '../utils/audio';
import { createRNG } from '../utils/rng';
import {
  Gamepad2,
  Calendar,
  Layers,
  Sparkles,
  Trophy,
  Play,
  ArrowRight,
  Plus,
  Compass,
  Volume2,
  VolumeX,
  Trash2,
  User,
  ExternalLink,
  MapPin,
  Bot
} from 'lucide-react';
import { motion } from 'motion/react';

interface MainMenuProps {
  onStartGame: (map: BomberMap, playAgainstGhost: boolean, watchOnly: boolean) => void;
  onOpenEditor: () => void;
}

const DEFAULT_MAP_WIDTH = 15;
const DEFAULT_MAP_HEIGHT = 13;

export default function MainMenu({ onStartGame, onOpenEditor }: MainMenuProps) {
  const [customMaps, setCustomMaps] = useState<BomberMap[]>([]);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'modes' | 'records' | 'maps'>('modes');
  const [importInput, setImportInput] = useState('');
  const [importedMap, setImportedMap] = useState<BomberMap | null>(null);

  useEffect(() => {
    setCustomMaps(getCustomMaps());
    setPersonalRecords(getPersonalRecords());
  }, []);

  // Quick Play Map Builder
  const buildQuickPlayMap = (difficulty: 'easy' | 'normal' | 'hard'): BomberMap => {
    const seed = Math.random().toString(36).substring(2, 9).toUpperCase();
    return buildProceduralMapForSeed(seed, `Rápido: ${seed}`, difficulty);
  };

  const buildDailyChallengeMap = (): BomberMap => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const seed = today.replace(/-/g, '').toUpperCase();
    return buildProceduralMapForSeed(seed, `Diário: ${today}`, 'normal');
  };

  const buildProceduralMapForSeed = (seed: string, name: string, difficulty: 'easy' | 'normal' | 'hard'): BomberMap => {
    // Basic structural layout
    const map: BomberMap = {
      version: 1,
      name,
      seed,
      width: DEFAULT_MAP_WIDTH,
      height: DEFAULT_MAP_HEIGHT,
      tiles: Array(DEFAULT_MAP_HEIGHT).fill(null).map((_, y) =>
        Array(DEFAULT_MAP_WIDTH).fill(null).map((__, x) => {
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
        { position: { x: DEFAULT_MAP_WIDTH - 2, y: DEFAULT_MAP_HEIGHT - 2 }, archetype: 'phantom', difficulty },
        { position: { x: DEFAULT_MAP_WIDTH - 2, y: 1 }, archetype: 'brute', difficulty },
        { position: { x: 1, y: DEFAULT_MAP_HEIGHT - 2 }, archetype: 'trickster', difficulty },
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
        author: 'Sistema',
        createdAt: new Date().toISOString(),
      },
    };

    // Fill with destructible blocks based on seed
    const rng = createRNG(seed);
    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        if (x % 2 === 0 && y % 2 === 0) continue;

        const isPlayerSafe = (x === 1 && y === 1) || (x === 1 && y === 2) || (x === 2 && y === 1);
        if (isPlayerSafe) continue;

        const isEnemySafe = map.enemySpawns.some(
          e => Math.abs(e.position.x - x) + Math.abs(e.position.y - y) <= 1
        );
        if (isEnemySafe) continue;

        if (rng() < map.powerUpConfig.spawnChance) {
          map.tiles[y][x] = 'destructible';
        }
      }
    }

    return map;
  };

  const handleImport = () => {
    audio.playClick();
    if (!importInput) return;

    try {
      const decompressed = decompressMap(importInput.trim());
      if (decompressed) {
        setImportedMap(decompressed);
        saveCustomMap(decompressed);
        setCustomMaps(getCustomMaps());
        setImportInput('');
        alert(`Mapa "${decompressed.name}" importado com sucesso!`);
      } else {
        alert('Código de importação do mapa inválido.');
      }
    } catch (err) {
      alert('Código de importação corrompido ou inválido.');
    }
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      audio.stopMusic();
    } else {
      audio.startMusic();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-800 flex flex-col items-center justify-between py-12 px-6 font-sans antialiased">
      {/* Upper header */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-neutral-900 rounded-xl flex items-center justify-center text-white font-black text-sm tracking-wider shadow">
            B
          </div>
          <span className="text-md font-black tracking-tight text-neutral-900">BomberWeb</span>
        </div>
        <button
          onClick={handleMuteToggle}
          className="p-2 bg-white hover:bg-neutral-100 border border-neutral-200/55 rounded-xl transition-all text-neutral-500 hover:text-neutral-800"
          aria-label="Toggle mute state"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Main Container Hero */}
      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 my-auto">
        {/* Left Column Brand presentation */}
        <div className="lg:col-span-5 flex flex-col justify-center gap-4">
          <span className="text-xs font-black uppercase tracking-widest text-amber-500">Mecânicas de Alta Precisão</span>
          <h1 className="text-4xl md:text-5xl font-black text-neutral-900 leading-none tracking-tight">
            Arena Tática de <br />
            <span className="text-amber-500">Sobrevivência</span>
          </h1>
          <p className="text-sm text-neutral-500 leading-relaxed max-w-sm mt-1">
            Reimaginação offline-first do clássico de explosivos com IA inteligente telegrafada, editor completo e reproduções de fantasmas determinísticos.
          </p>

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => {
                audio.playClick();
                onStartGame(buildQuickPlayMap('normal'), false, false);
              }}
              className="px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-2xl text-xs flex items-center gap-1.5 shadow-md transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              Início Rápido
            </button>
            <button
              onClick={() => {
                audio.playClick();
                onOpenEditor();
              }}
              className="px-6 py-3 bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-800 font-bold rounded-2xl text-xs flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              Editor de Mapas
            </button>
          </div>
        </div>

        {/* Right Column Grid Dashboard */}
        <div className="lg:col-span-7 flex flex-col bg-white border border-neutral-200/50 rounded-3xl shadow-sm overflow-hidden">
          {/* Tabs header */}
          <div className="flex border-b border-neutral-100 bg-neutral-50/50 p-2">
            <button
              onClick={() => { audio.playClick(); setActiveTab('modes'); }}
              className={`flex-grow py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'modes' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <Gamepad2 className="w-4 h-4" />
              Modos
            </button>
            <button
              onClick={() => { audio.playClick(); setActiveTab('maps'); }}
              className={`flex-grow py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'maps' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <Layers className="w-4 h-4" />
              Suas Arenas ({customMaps.length})
            </button>
            <button
              onClick={() => { audio.playClick(); setActiveTab('records'); }}
              className={`flex-grow py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'records' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <Trophy className="w-4 h-4" />
              Recordes ({personalRecords.length})
            </button>
          </div>

          {/* Tab content area */}
          <div className="p-6 flex-grow flex flex-col h-[320px] overflow-y-auto">
            {activeTab === 'modes' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Mode Daily */}
                <div
                  onClick={() => {
                    audio.playClick();
                    onStartGame(buildDailyChallengeMap(), false, false);
                  }}
                  className="p-4 border border-neutral-200/60 hover:border-amber-400 rounded-2xl cursor-pointer group transition-all flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2.5 bg-amber-50 rounded-xl text-amber-500">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-neutral-900 group-hover:text-amber-600 transition-colors">Desafio do Dia</h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5 font-bold">Semente diária mundial de alta velocidade</p>
                  </div>
                </div>

                {/* Mode Contra Replay */}
                <div className="p-4 border border-neutral-200/60 rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 bg-blue-50 rounded-xl text-blue-500">
                      <Compass className="w-5 h-5" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-neutral-900">Importar Arena Social</h3>
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Cole o código do mapa..."
                        value={importInput}
                        onChange={(e) => setImportInput(e.target.value)}
                        className="text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 outline-none w-full"
                      />
                      <button
                        onClick={handleImport}
                        className="px-3 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-[10px] font-bold"
                      >
                        Ir
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'maps' && (
              <div className="flex flex-col gap-3">
                {customMaps.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400">
                    <Layers className="w-10 h-10 mx-auto opacity-30 mb-2" />
                    <p className="text-xs font-bold">Nenhum mapa gravado localmente.</p>
                    <p className="text-[10px] mt-0.5">Use o Editor para desenhar suas próprias arenas!</p>
                  </div>
                ) : (
                  customMaps.map((map, idx) => (
                    <div
                      key={idx}
                      className="p-3 border border-neutral-100 rounded-xl flex justify-between items-center hover:bg-neutral-50 transition-all"
                    >
                      <div>
                        <h4 className="text-xs font-black text-neutral-900">{map.name}</h4>
                        <span className="text-[10px] text-neutral-400 font-bold block mt-0.5">
                          {map.meta.author || 'Anônimo'} · {new Date(map.meta.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {map.ghost && (
                          <button
                            onClick={() => {
                              audio.playClick();
                              onStartGame(map, true, false);
                            }}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] rounded-lg transition-all"
                            title="Desafiar fantasma do autor"
                          >
                            vs Fantasma
                          </button>
                        )}
                        <button
                          onClick={() => {
                            audio.playClick();
                            onStartGame(map, false, false);
                          }}
                          className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] rounded-lg transition-all"
                        >
                          Jogar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'records' && (
              <div className="flex flex-col gap-3">
                {personalRecords.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400">
                    <Trophy className="w-10 h-10 mx-auto opacity-30 mb-2" />
                    <p className="text-xs font-bold">Nenhum recorde registrado ainda.</p>
                    <p className="text-[10px] mt-0.5">Vença os inimigos nas arenas para gravar seus melhores tempos!</p>
                  </div>
                ) : (
                  personalRecords.map((r, idx) => (
                    <div
                      key={idx}
                      className="p-3 border border-neutral-100 rounded-xl flex justify-between items-center bg-neutral-50/40"
                    >
                      <div>
                        <h4 className="text-xs font-black text-neutral-900">{r.mapName}</h4>
                        <span className="text-[10px] text-neutral-400 font-bold block mt-0.5">
                          Seed: {r.seed}
                        </span>
                      </div>
                      <span className="text-sm font-black font-mono text-amber-500">
                        {r.bestTime.toFixed(2)}s
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer metadata details */}
      <footer className="w-full max-w-5xl flex justify-between items-center mt-6 text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
        <span>BomberWeb v0.1 © 2026</span>
        <span>Made with Vite · TypeScript · Tailwind CSS</span>
      </footer>
    </div>
  );
}
