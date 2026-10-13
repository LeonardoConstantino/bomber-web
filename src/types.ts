/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TileType = 'floor' | 'solid' | 'destructible';

export type Action = 'up' | 'down' | 'left' | 'right' | 'bomb' | 'special' | 'none';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type BotArchetype = 'phantom' | 'brute' | 'trickster' | 'sentinel';

export interface Vec2 {
  x: number;
  y: number;
}

export interface InputEvent {
  tick: number;
  action: Action;
  pressed: boolean;
}

export interface GhostRecord {
  version: number;
  mapSeed: string;
  playerName: string;
  completedAt: number;
  result: 'win' | 'lose' | 'incomplete';
  inputs: InputEvent[];
}

export interface PowerUpConfig {
  spawnChance: number; // 0.0 to 1.0
  weights: {
    blast_up: number;
    bomb_up: number;
    speed_up: number;
    remote_bomb: number;
    shield: number;
    kick: number;
    skate: number;
  };
}

export interface BomberMap {
  version: number;
  name: string;
  seed?: string;
  width: number;
  height: number;
  tiles: TileType[][]; // Grid rows of height, cols of width
  playerSpawn: Vec2;
  enemySpawns: {
    position: Vec2;
    archetype: BotArchetype;
    difficulty: 'easy' | 'normal' | 'hard';
  }[];
  powerUpConfig: PowerUpConfig;
  suddenDeathSeconds?: number;
  ghost?: GhostRecord;
  meta: {
    author?: string;
    createdAt: string;
  };
}

export type PowerUpType = 'blast_up' | 'bomb_up' | 'speed_up' | 'remote_bomb' | 'shield' | 'kick' | 'skate';

export interface PlayerStats {
  maxBombs: number;
  bombsPlaced: number;
  blastRadius: number;
  speed: number; // Grid tiles per second
  hasRemote: boolean;
  hasShield: boolean;
  hasKick: boolean;
  hasSkateActive: boolean;
  skateTicksRemaining: number;
}

export interface PlayerEntity {
  id: 'player';
  position: Vec2; // exact cell coords (discrete target)
  pixelPos: Vec2; // sub-grid smooth coordinates
  alive: boolean;
  stats: PlayerStats;
  facing: Direction;
  invulTicks: number; // for shield/spawn temporary safety
}

export interface BotEntity {
  id: string; // e.g. 'bot_0', 'bot_1'
  archetype: BotArchetype;
  difficulty: 'easy' | 'normal' | 'hard';
  position: Vec2;
  pixelPos: Vec2;
  alive: boolean;
  stats: PlayerStats;
  facing: Direction;
  powerActive: boolean;
  powerCooldownTicks: number;
  powerTicksRemaining: number;
  phaseShiftActive?: boolean; // Phantom specific
  lookScanTicks?: number; // Sentinel scan visual effect
}

export interface GhostEntity {
  id: 'ghost';
  position: Vec2;
  pixelPos: Vec2;
  alive: boolean;
  facing: Direction;
  stats: PlayerStats; // mirror stats
}

export interface BombEntity {
  id: string;
  position: Vec2;
  ownerId: string; // 'player' or 'ghost' or bot id
  radius: number;
  ticksRemaining: number;
  isRemote: boolean;
  isMoving: boolean;
  moveDir?: Direction;
}

export interface FlameEntity {
  id: string;
  position: Vec2;
  ticksRemaining: number;
  isEpicenter: boolean;
  direction?: Direction; // which blast arm
}

export interface PowerUpEntity {
  id: string;
  position: Vec2;
  type: PowerUpType;
}

export interface WorldState {
  tick: number;
  map: BomberMap;
  player: PlayerEntity;
  bots: BotEntity[];
  bombs: BombEntity[];
  flames: FlameEntity[];
  powerUps: PowerUpEntity[];
  ghost?: GhostEntity;
  phase: 'playing' | 'win' | 'lose' | 'watching';
  score: number;
  timeElapsed: number; // in seconds
}

export interface MapRecord {
  id: string;
  name: string;
  createdAt: string;
  mapData: BomberMap;
}

export interface PersonalRecord {
  seed: string;
  mapName: string;
  bestTime: number; // in seconds
  completedAt: string;
}
