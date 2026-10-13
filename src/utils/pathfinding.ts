/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vec2, TileType, BombEntity, FlameEntity } from '../types';

/**
 * Key representation for coordinate map lookups.
 */
export function toKey(pos: Vec2): string {
  return `${pos.x},${pos.y}`;
}

/**
 * Parse coordinate string back to Vec2.
 */
export function fromKey(key: string): Vec2 {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

/**
 * Simulates active bombs and returns a map of coordinates "x,y" to the tick in which they will explode.
 * Handles chain-reactions: if Bomb A explodes and hits Bomb B, Bomb B's explosion is advanced to the same tick.
 */
export function predictExplosionTimes(
  bombs: BombEntity[],
  tiles: TileType[][],
  width: number,
  height: number
): Record<string, number> {
  const bombMap = new Map<string, BombEntity>();
  bombs.forEach(b => bombMap.set(toKey(b.position), b));

  // We want to find the true explosion tick for each bomb, accounting for chain reactions
  const explosionTicks: Record<string, number> = {};
  const processed = new Set<string>();

  // Helper to trace explosion and trigger chain reactions
  function traceExplosion(bomb: BombEntity, triggerTick: number) {
    const bKey = toKey(bomb.position);
    if (processed.has(bKey)) {
      if (explosionTicks[bKey] > triggerTick) {
        explosionTicks[bKey] = triggerTick;
      } else {
        return;
      }
    } else {
      explosionTicks[bKey] = triggerTick;
      processed.add(bKey);
    }

    const dirs = [
      { x: 0, y: -1 }, // Up
      { x: 0, y: 1 },  // Down
      { x: -1, y: 0 }, // Left
      { x: 1, y: 0 },  // Right
    ];

    dirs.forEach(d => {
      for (let dist = 1; dist <= bomb.radius; dist++) {
        const tx = bomb.position.x + d.x * dist;
        const ty = bomb.position.y + d.y * dist;

        if (tx < 0 || tx >= width || ty < 0 || ty >= height) break;

        const tile = tiles[ty][tx];
        const targetKey = `${tx},${ty}`;

        if (tile === 'solid') {
          break; // Blocked completely
        }

        const adjacentBomb = bombMap.get(targetKey);
        if (adjacentBomb) {
          // Triggers this bomb as well!
          traceExplosion(adjacentBomb, triggerTick);
        }

        if (tile === 'destructible') {
          break; // Destructible block stops blast, but gets destroyed
        }
      }
    });
  }

  // Trace starting with normal ticking order
  const sortedBombs = [...bombs].sort((a, b) => a.ticksRemaining - b.ticksRemaining);
  sortedBombs.forEach(b => {
    traceExplosion(b, b.ticksRemaining);
  });

  return explosionTicks;
}

/**
 * Predicts the exact flame hazard layout.
 * Returns a mapping of "x,y" to the tick range in which flames will be active on that cell.
 * Flames typically last 40 ticks (0.66s) after a bomb explodes.
 */
export function predictFlameTicks(
  bombs: BombEntity[],
  tiles: TileType[][],
  width: number,
  height: number,
  flameDuration = 40
): Record<string, { start: number; end: number }> {
  const explosionTicks = predictExplosionTimes(bombs, tiles, width, height);
  const flameMap: Record<string, { start: number; end: number }> = {};

  const bombMap = new Map<string, BombEntity>();
  bombs.forEach(b => bombMap.set(toKey(b.position), b));

  Object.entries(explosionTicks).forEach(([bKey, triggerTick]) => {
    const bomb = bombMap.get(bKey);
    if (!bomb) return;

    // The bomb cell itself is in flames
    if (!flameMap[bKey] || flameMap[bKey].start > triggerTick) {
      flameMap[bKey] = { start: triggerTick, end: triggerTick + flameDuration };
    }

    const dirs = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];

    dirs.forEach(d => {
      for (let dist = 1; dist <= bomb.radius; dist++) {
        const tx = bomb.position.x + d.x * dist;
        const ty = bomb.position.y + d.y * dist;

        if (tx < 0 || tx >= width || ty < 0 || ty >= height) break;

        const tile = tiles[ty][tx];
        if (tile === 'solid') break;

        const targetKey = `${tx},${ty}`;
        const currentRange = flameMap[targetKey];

        if (!currentRange || currentRange.start > triggerTick) {
          flameMap[targetKey] = { start: triggerTick, end: triggerTick + flameDuration };
        }

        if (tile === 'destructible') {
          break; // Destructible blocks absorb the blast
        }
      }
    });
  });

  return flameMap;
}

/**
 * Evaluates the safety of cell tiles.
 * Returns a score for each coordinate. Higher is safer.
 * -100 means death is certain or cell is currently blocked.
 */
export function calculateSafetyScores(
  tiles: TileType[][],
  bombs: BombEntity[],
  flames: FlameEntity[],
  width: number,
  height: number,
  botPosition: Vec2,
  phaseShiftActive = false
): Record<string, number> {
  const scores: Record<string, number> = {};
  const hazardMap = predictFlameTicks(bombs, tiles, width, height);

  // Active flames are instantly lethal
  const activeFlames = new Set<string>();
  flames.forEach(f => activeFlames.add(toKey(f.position)));

  // Active bomb positions are blocked
  const activeBombs = new Set<string>();
  bombs.forEach(b => activeBombs.add(toKey(b.position)));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = { x, y };
      const key = toKey(p);
      const tile = tiles[y][x];

      // Blocked cells
      if (tile === 'solid') {
        scores[key] = -100;
        continue;
      }
      if (tile === 'destructible' && !phaseShiftActive) {
        scores[key] = -100;
        continue;
      }
      if (activeBombs.has(key)) {
        scores[key] = -100;
        continue;
      }
      if (activeFlames.has(key)) {
        scores[key] = -100;
        continue;
      }

      // Check predictive flame hazard
      const hazard = hazardMap[key];
      if (hazard) {
        // If a bomb is about to explode in less than 50 ticks, prioritize escaping it
        if (hazard.start < 45) {
          scores[key] = -50 + (hazard.start * 0.5); // Urgent hazard
        } else {
          scores[key] = -10; // Ticking bomb in vicinity, moderate warning
        }
      } else {
        scores[key] = 10; // Base safe tile score
      }

      // Proximity to other safe spaces (add points if neighbors are safe, so it prefers open corridors)
      let openNeighbors = 0;
      const neighbors = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ];
      neighbors.forEach(n => {
        if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
          const nTile = tiles[n.y][n.x];
          const nKey = toKey(n);
          if (nTile === 'floor' && !activeBombs.has(nKey) && !hazardMap[nKey]) {
            openNeighbors++;
          }
        }
      });
      scores[key] += openNeighbors * 2;
    }
  }

  return scores;
}

/**
 * Standard Breadth-First Search (BFS) to find the shortest path from start to target.
 * isWalkable defines which cells can be traversed.
 */
export function findShortestPath(
  start: Vec2,
  target: Vec2,
  width: number,
  height: number,
  isWalkable: (p: Vec2) => boolean
): Vec2[] | null {
  if (start.x === target.x && start.y === target.y) {
    return [];
  }

  const queue: Vec2[] = [start];
  const visited = new Set<string>([toKey(start)]);
  const parentMap = new Map<string, string>();

  let found = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currKey = toKey(current);

    if (current.x === target.x && current.y === target.y) {
      found = true;
      break;
    }

    const neighbors = [
      { x: current.x, y: current.y - 1 }, // Up
      { x: current.x, y: current.y + 1 }, // Down
      { x: current.x - 1, y: current.y }, // Left
      { x: current.x + 1, y: current.y }, // Right
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;

      const nKey = toKey(n);
      if (visited.has(nKey)) continue;

      // Ensure neighbor is walkable, or is the target cell
      const isTarget = n.x === target.x && n.y === target.y;
      if (isWalkable(n) || isTarget) {
        visited.add(nKey);
        parentMap.set(nKey, currKey);
        queue.push(n);
      }
    }
  }

  if (!found) return null;

  // Reconstruct path
  const path: Vec2[] = [];
  let currentKey = toKey(target);
  const startKey = toKey(start);

  while (currentKey !== startKey) {
    path.push(fromKey(currentKey));
    const parent = parentMap.get(currentKey);
    if (!parent) break;
    currentKey = parent;
  }

  return path.reverse();
}

/**
 * Find nearest safe tile using safety scores, starting from current cell.
 */
export function findNearestSafeTile(
  start: Vec2,
  safetyScores: Record<string, number>,
  width: number,
  height: number,
  isWalkable: (p: Vec2) => boolean
): Vec2 | null {
  const startKey = toKey(start);
  if (safetyScores[startKey] !== undefined && safetyScores[startKey] > 0) {
    return start; // Already safe!
  }

  // BFS search outward for the highest scoring reachable tile
  const queue: Vec2[] = [start];
  const visited = new Set<string>([startKey]);

  let bestTile: Vec2 | null = null;
  let bestScore = -999;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = toKey(current);
    const score = safetyScores[key] || -100;

    if (score > bestScore && score > 0) {
      bestScore = score;
      bestTile = current;
      // If we find an exceptionally safe tile, we can stop early
      if (score >= 10) {
        return current;
      }
    }

    const neighbors = [
      { x: current.x, y: current.y - 1 },
      { x: current.x, y: current.y + 1 },
      { x: current.x - 1, y: current.y },
      { x: current.x + 1, y: current.y },
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
      const nKey = toKey(n);
      if (visited.has(nKey)) continue;

      if (isWalkable(n)) {
        visited.add(nKey);
        queue.push(n);
      }
    }
  }

  return bestTile;
}
