/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BotEntity, WorldState, Action, Vec2, TileType, BombEntity } from '../types';
import {
  toKey,
  calculateSafetyScores,
  findNearestSafeTile,
  findShortestPath
} from './pathfinding';
import { audio } from './audio';

/**
 * Main entrance function to compute the next Action for a bot.
 * It operates on grid alignment: when a bot is aligned to its current tile,
 * it runs this logic to select the next direction or action.
 */
export function getBotAction(
  bot: BotEntity,
  state: WorldState,
  rng: () => number
): Action {
  if (!bot.alive || state.phase !== 'playing') return 'none';

  const map = state.map;
  const player = state.player;
  const width = map.width;
  const height = map.height;

  // 1. Calculate safety scores for the board
  const isPhantom = bot.archetype === 'phantom';
  const isPhaseShift = isPhantom && bot.phaseShiftActive;
  
  const safetyScores = calculateSafetyScores(
    map.tiles,
    state.bombs,
    state.flames,
    width,
    height,
    bot.position,
    isPhaseShift
  );

  // Define walkable filter for BFS
  const isWalkable = (p: Vec2) => {
    const tile = map.tiles[p.y]?.[p.x];
    if (tile === 'solid') return false;
    if (tile === 'destructible' && !isPhaseShift) return false;

    // Avoid walking into active bombs
    const bombAtTile = state.bombs.some(b => b.position.x === p.x && b.position.y === p.y);
    if (bombAtTile) return false;

    return true;
  };

  const currentKey = toKey(bot.position);
  const currentSafety = safetyScores[currentKey] || 0;

  // 2. CHECK IMMEDIATE THREAT: If we are standing on a dangerous tile (score <= 0), we MUST escape!
  if (currentSafety <= 0) {
    // Find nearest safe tile
    const safeTile = findNearestSafeTile(bot.position, safetyScores, width, height, isWalkable);
    if (safeTile) {
      const path = findShortestPath(bot.position, safeTile, width, height, isWalkable);
      if (path && path.length > 0) {
        return getDirectionToAction(bot.position, path[0]);
      }
    }
  }

  // 3. ARCHETYPE CUSTOM POWERS AND OFFENSIVE DECISIONS

  // ---- PHANTOM (Phase Shift) ----
  if (bot.archetype === 'phantom') {
    // Phase Shift triggers when there's no walkable path to the player, but phase shifting would allow it
    if (bot.powerCooldownTicks <= 0 && !bot.phaseShiftActive) {
      // Check if standard pathfinding fails to find the player
      const standardPath = findShortestPath(bot.position, player.position, width, height, isWalkable);
      if (!standardPath) {
        // Check if path with phase shift (walk through destructible) exists
        const phaseShiftWalkable = (p: Vec2) => map.tiles[p.y]?.[p.x] !== 'solid';
        const shiftPath = findShortestPath(bot.position, player.position, width, height, phaseShiftWalkable);
        if (shiftPath && shiftPath.length > 0) {
          audio.playSpecialPower();
          return 'special'; // Triggers Phase Shift!
        }
      }
    }

    // Move directly towards player
    const path = findShortestPath(bot.position, player.position, width, height, isWalkable);
    if (path && path.length > 0) {
      // Phantom has a small chance to plant a bomb if very close to the player
      const dist = Math.abs(bot.position.x - player.position.x) + Math.abs(bot.position.y - player.position.y);
      if (dist <= 1 && rng() < 0.25 && state.bombs.filter(b => b.ownerId === bot.id).length < bot.stats.maxBombs) {
        return 'bomb';
      }
      return getDirectionToAction(bot.position, path[0]);
    }
  }

  // ---- BRUTE (Mega Blast & Demolition) ----
  else if (bot.archetype === 'brute') {
    const lineOfSightPlayer = (bot.position.x === player.position.x || bot.position.y === player.position.y);
    const distToPlayer = Math.abs(bot.position.x - player.position.x) + Math.abs(bot.position.y - player.position.y);

    // Triggers Mega Blast! (radius 5 bomb)
    if (bot.powerCooldownTicks <= 0 && lineOfSightPlayer && distToPlayer >= 3 && distToPlayer <= 5) {
      audio.playSpecialPower();
      return 'special';
    }

    // Territorial: if near destructibles, high chance to bomb them
    const neighbors = [
      { x: bot.position.x, y: bot.position.y - 1 },
      { x: bot.position.x, y: bot.position.y + 1 },
      { x: bot.position.x - 1, y: bot.position.y },
      { x: bot.position.x + 1, y: bot.position.y },
    ];
    const nearDestructible = neighbors.some(n => map.tiles[n.y]?.[n.x] === 'destructible');
    if (nearDestructible && rng() < 0.45 && state.bombs.filter(b => b.ownerId === bot.id).length < bot.stats.maxBombs) {
      // Only plant if there's an escape route
      const tempBomb: BombEntity = {
        id: 'temp',
        position: bot.position,
        ownerId: bot.id,
        radius: bot.stats.blastRadius,
        ticksRemaining: 180,
        isRemote: false,
        isMoving: false,
      };
      const simulatedBombs = [...state.bombs, tempBomb];
      const simSafety = calculateSafetyScores(map.tiles, simulatedBombs, state.flames, width, height, bot.position);
      const escapeTile = findNearestSafeTile(bot.position, simSafety, width, height, isWalkable);
      if (escapeTile) {
        return 'bomb';
      }
    }

    // Pursue player
    const path = findShortestPath(bot.position, player.position, width, height, isWalkable);
    if (path && path.length > 0) {
      return getDirectionToAction(bot.position, path[0]);
    }
  }

  // ---- TRICKSTER (Remote Bomb & Chaotic Noise) ----
  else if (bot.archetype === 'trickster') {
    // 15% random chaotic move factor (noise)
    const noiseFactor = bot.difficulty === 'easy' ? 0.35 : 0.15;
    if (rng() < noiseFactor) {
      const dirs: Action[] = ['up', 'down', 'left', 'right'];
      const randomDir = dirs[Math.floor(rng() * dirs.length)];
      const targetCell = getTargetCell(bot.position, randomDir);
      if (isWalkable(targetCell)) {
        return randomDir;
      }
    }

    // Remote bomb detonator logic: if player is standing on a tile that is threatened by one of our remote bombs, blow it up!
    const activeRemoteBombs = state.bombs.filter(b => b.ownerId === bot.id && b.isRemote);
    if (activeRemoteBombs.length > 0) {
      // Check if player is standing on any of the blast radius cells of our remote bombs
      const playerOnBlast = activeRemoteBombs.some(b => {
        const dx = Math.abs(b.position.x - player.position.x);
        const dy = Math.abs(b.position.y - player.position.y);
        if (b.position.x === player.position.x && dy <= b.radius) {
          // Check line of sight (no solids or destructibles in between)
          const stepY = player.position.y > b.position.y ? 1 : -1;
          for (let y = b.position.y + stepY; y !== player.position.y; y += stepY) {
            if (map.tiles[y]?.[b.position.x] !== 'floor') return false;
          }
          return true;
        }
        if (b.position.y === player.position.y && dx <= b.radius) {
          const stepX = player.position.x > b.position.x ? 1 : -1;
          for (let x = b.position.x + stepX; x !== player.position.x; x += stepX) {
            if (map.tiles[b.position.y]?.[x] !== 'floor') return false;
          }
          return true;
        }
        return false;
      });

      if (playerOnBlast) {
        audio.playSpecialPower();
        return 'special'; // Detonate remote bomb!
      }
    }

    // Remote Bomb planting: plant a remote bomb if player is close or in range
    const distToPlayer = Math.abs(bot.position.x - player.position.x) + Math.abs(bot.position.y - player.position.y);
    if (bot.powerCooldownTicks <= 0 && distToPlayer <= 3 && state.bombs.filter(b => b.ownerId === bot.id).length < bot.stats.maxBombs) {
      const tempBomb: BombEntity = {
        id: 'temp',
        position: bot.position,
        ownerId: bot.id,
        radius: bot.stats.blastRadius,
        ticksRemaining: 360, // remote bombs live longer
        isRemote: true,
        isMoving: false,
      };
      const simulatedBombs = [...state.bombs, tempBomb];
      const simSafety = calculateSafetyScores(map.tiles, simulatedBombs, state.flames, width, height, bot.position);
      const escapeTile = findNearestSafeTile(bot.position, simSafety, width, height, isWalkable);
      if (escapeTile) {
        return 'bomb'; // Plants remote bomb!
      }
    }

    // standard pursue
    const path = findShortestPath(bot.position, player.position, width, height, isWalkable);
    if (path && path.length > 0) {
      return getDirectionToAction(bot.position, path[0]);
    }
  }

  // ---- SENTINEL (Freeze Bomb & Strategic Block) ----
  else if (bot.archetype === 'sentinel') {
    // Escapes and scans player. Sentinel only plants if player is caught in a dead-end corridor or very close
    const distToPlayer = Math.abs(bot.position.x - player.position.x) + Math.abs(bot.position.y - player.position.y);
    
    // Freeze Bomb power triggers when player is nearby in a grid corridor
    if (bot.powerCooldownTicks <= 0 && distToPlayer <= 3) {
      audio.playSpecialPower();
      return 'special'; // Freeze bomb!
    }

    // Plant defensive block bomb
    if (distToPlayer <= 2 && rng() < 0.35 && state.bombs.filter(b => b.ownerId === bot.id).length < bot.stats.maxBombs) {
      const tempBomb: BombEntity = {
        id: 'temp',
        position: bot.position,
        ownerId: bot.id,
        radius: bot.stats.blastRadius,
        ticksRemaining: 180,
        isRemote: false,
        isMoving: false,
      };
      const simulatedBombs = [...state.bombs, tempBomb];
      const simSafety = calculateSafetyScores(map.tiles, simulatedBombs, state.flames, width, height, bot.position);
      const escapeTile = findNearestSafeTile(bot.position, simSafety, width, height, isWalkable);
      if (escapeTile) {
        return 'bomb';
      }
    }

    // Smart pursue or gather powerups
    const path = findShortestPath(bot.position, player.position, width, height, isWalkable);
    if (path && path.length > 0) {
      return getDirectionToAction(bot.position, path[0]);
    }
  }

  // 4. Default wandering: pick any open adjacent tile
  const moves: Action[] = ['up', 'down', 'left', 'right'];
  const validMoves = moves.filter(m => {
    const target = getTargetCell(bot.position, m);
    return isWalkable(target) && (safetyScores[toKey(target)] || 0) > 0;
  });

  if (validMoves.length > 0) {
    return validMoves[Math.floor(rng() * validMoves.length)];
  }

  return 'none';
}

/**
 * Convert a delta movement into an Action direction.
 */
function getDirectionToAction(from: Vec2, to: Vec2): Action {
  if (to.y < from.y) return 'up';
  if (to.y > from.y) return 'down';
  if (to.x < from.x) return 'left';
  if (to.x > from.x) return 'right';
  return 'none';
}

/**
 * Get target cell from position and action direction.
 */
function getTargetCell(pos: Vec2, action: Action): Vec2 {
  switch (action) {
    case 'up': return { x: pos.x, y: pos.y - 1 };
    case 'down': return { x: pos.x, y: pos.y + 1 };
    case 'left': return { x: pos.x - 1, y: pos.y };
    case 'right': return { x: pos.x + 1, y: pos.y };
    default: return { ...pos };
  }
}
