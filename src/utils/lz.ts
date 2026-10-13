/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import LZString from 'lz-string';
import { BomberMap, GhostRecord } from '../types';

/**
 * Compact representation of a BomberMap to minimize serialized size.
 */
interface CompactMap {
  v: number; // version
  n: string; // name
  s?: string; // seed
  w: number; // width
  h: number; // height
  t: string[]; // RLE or flat characters for tiles: s=solid, d=destructible, f=floor
  p: [number, number]; // player spawn
  e: {
    x: number;
    y: number;
    a: 'phantom' | 'brute' | 'trickster' | 'sentinel';
    d: 'easy' | 'normal' | 'hard';
  }[]; // enemy spawns
  c: {
    sc: number; // spawn chance
    w: number[]; // weights for blast_up, bomb_up, speed_up, remote_bomb, shield, kick, skate
  };
  sd?: number; // sudden death seconds
  g?: GhostRecord;
  a?: string; // author
  ca: string; // created at
}

const POWERUP_KEYS = ['blast_up', 'bomb_up', 'speed_up', 'remote_bomb', 'shield', 'kick', 'skate'] as const;

/**
 * Convert a full BomberMap to a CompactMap structure.
 */
function toCompact(map: BomberMap): CompactMap {
  // Flat tile characters: 'f' = floor, 's' = solid, 'd' = destructible
  const tileStrRows: string[] = [];
  for (let y = 0; y < map.height; y++) {
    let rowStr = '';
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y][x];
      if (tile === 'solid') rowStr += 's';
      else if (tile === 'destructible') rowStr += 'd';
      else rowStr += 'f';
    }
    tileStrRows.push(rowStr);
  }

  const weightsArray = POWERUP_KEYS.map(k => map.powerUpConfig.weights[k] || 0);

  return {
    v: map.version,
    n: map.name,
    s: map.seed,
    w: map.width,
    h: map.height,
    t: tileStrRows,
    p: [map.playerSpawn.x, map.playerSpawn.y],
    e: map.enemySpawns.map(e => ({
      x: e.position.x,
      y: e.position.y,
      a: e.archetype,
      d: e.difficulty,
    })),
    c: {
      sc: map.powerUpConfig.spawnChance,
      w: weightsArray,
    },
    sd: map.suddenDeathSeconds,
    g: map.ghost,
    a: map.meta.author,
    ca: map.meta.createdAt,
  };
}

/**
 * Restore a CompactMap back to a full BomberMap.
 */
function fromCompact(compact: CompactMap): BomberMap {
  const tiles: ('floor' | 'solid' | 'destructible')[][] = [];
  for (let y = 0; y < compact.h; y++) {
    const row: ('floor' | 'solid' | 'destructible')[] = [];
    const rowStr = compact.t[y] || '';
    for (let x = 0; x < compact.w; x++) {
      const char = rowStr[x] || 'f';
      if (char === 's') row.push('solid');
      else if (char === 'd') row.push('destructible');
      else row.push('floor');
    }
    tiles.push(row);
  }

  const weights: any = {};
  POWERUP_KEYS.forEach((key, idx) => {
    weights[key] = compact.c.w[idx] !== undefined ? compact.c.w[idx] : 10;
  });

  return {
    version: compact.v,
    name: compact.n,
    seed: compact.s,
    width: compact.w,
    height: compact.h,
    tiles,
    playerSpawn: { x: compact.p[0], y: compact.p[1] },
    enemySpawns: compact.e.map(e => ({
      position: { x: e.x, y: e.y },
      archetype: e.a,
      difficulty: e.d,
    })),
    powerUpConfig: {
      spawnChance: compact.c.sc,
      weights: weights as any,
    },
    suddenDeathSeconds: compact.sd,
    ghost: compact.g,
    meta: {
      author: compact.a,
      createdAt: compact.ca,
    },
  };
}

/**
 * Compress a BomberMap with its optional ghost replay into an encoded URI component string.
 */
export function compressMap(map: BomberMap): string {
  try {
    const compact = toCompact(map);
    const jsonStr = JSON.stringify(compact);
    return LZString.compressToEncodedURIComponent(jsonStr);
  } catch (err) {
    console.error('Failed to compress map:', err);
    return '';
  }
}

/**
 * Decompress an encoded URI component string back into a BomberMap.
 */
export function decompressMap(str: string): BomberMap | null {
  try {
    const jsonStr = LZString.decompressFromEncodedURIComponent(str);
    if (!jsonStr) return null;
    const compact = JSON.parse(jsonStr) as CompactMap;
    return fromCompact(compact);
  } catch (err) {
    console.error('Failed to decompress map:', err);
    return null;
  }
}

/**
 * Generate a shareable link for a map and its ghost replay.
 */
export function generateShareURL(map: BomberMap, ghost?: GhostRecord): string {
  const mapToShare = { ...map };
  if (ghost) {
    mapToShare.ghost = ghost;
  }
  const compressed = compressMap(mapToShare);
  const baseURL = window.location.origin + window.location.pathname;
  return `${baseURL}?m=${compressed}`;
}
