/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  BomberMap,
  WorldState,
  Action,
  InputEvent,
  Direction,
  BombEntity,
  FlameEntity,
  PowerUpEntity,
  BotEntity,
  GhostRecord,
  Vec2,
  PowerUpType
} from '../types';
import { getBotAction } from '../utils/botAI';
import { createRNG, randomInt } from '../utils/rng';
import { audio } from '../utils/audio';
import { savePersonalRecord } from '../utils/db';
import { generateShareURL } from '../utils/lz';
import TouchDpad from './TouchDpad';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy,
  Flame,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Share2,
  ArrowLeft,
  Tv,
  Users,
  Award,
  Zap,
  Shield,
  Clock
} from 'lucide-react';

interface GameCanvasProps {
  map: BomberMap;
  onBack: () => void;
  playAgainstGhost?: boolean;
  watchOnly?: boolean;
}

const TICK_RATE = 60;
const TICK_MS = 1000 / TICK_RATE;
const TILE_SIZE = 48; // in canvas pixels
const DEFAULT_MAP_WIDTH = 15;
const DEFAULT_MAP_HEIGHT = 13;

export default function GameCanvas({
  map,
  onBack,
  playAgainstGhost = false,
  watchOnly = false,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sound toggles
  const [isMuted, setIsMuted] = useState(false);

  // Screen UI overlays
  const [gamePhase, setGamePhase] = useState<'playing' | 'win' | 'lose' | 'watching'>('playing');
  const [winTime, setWinTime] = useState<number>(0);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [restartKey, setRestartKey] = useState(0);

  // World states (using mutable refs for the high-performance game loop, syncing to React state only when phase changes)
  const stateRef = useRef<WorldState | null>(null);
  const keysPressed = useRef<Set<string>>(new Set());
  const tickCounter = useRef<number>(0);

  // Ghost Recording
  const playerInputs = useRef<InputEvent[]>([]);

  // Camera Shake
  const cameraShake = useRef<number>(0);

  // Particles
  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    life: number;
    maxLife: number;
    size: number;
  }
  const particles = useRef<Particle[]>([]);

  // Float text/indicators
  interface FloatText {
    x: number; // grid coords
    y: number;
    text: string;
    color: string;
    life: number;
  }
  const floatTexts = useRef<FloatText[]>([]);

  // Seed / RNG for gameplay (independent of map layout generation, but deterministic)
  const gameRNG = useRef<() => number>(() => Math.random());

  // Initialization
  useEffect(() => {
    // Start background music
    if (!isMuted) {
      audio.startMusic();
    }

    // Load/Generate Map
    const gameMap = JSON.parse(JSON.stringify(map)) as BomberMap;
    const seed = gameMap.seed || Math.random().toString(36).substring(2, 9).toUpperCase();
    gameRNG.current = createRNG(seed);

    // Initial World State
    const initialState: WorldState = {
      tick: 0,
      map: gameMap,
      player: {
        id: 'player',
        position: { x: gameMap.playerSpawn.x, y: gameMap.playerSpawn.y },
        pixelPos: { x: gameMap.playerSpawn.x, y: gameMap.playerSpawn.y },
        alive: true,
        stats: {
          maxBombs: 1,
          bombsPlaced: 0,
          blastRadius: 2,
          speed: 4, // in tiles/second
          hasRemote: false,
          hasShield: false,
          hasKick: false,
          hasSkateActive: false,
          skateTicksRemaining: 0,
        },
        facing: 'down',
        invulTicks: 60, // 1 second spawn protection
      },
      bots: gameMap.enemySpawns.map((s, idx) => ({
        id: `bot_${idx}`,
        archetype: s.archetype,
        difficulty: s.difficulty,
        position: { x: s.position.x, y: s.position.y },
        pixelPos: { x: s.position.x, y: s.position.y },
        alive: true,
        stats: {
          maxBombs: s.archetype === 'brute' ? 2 : 1,
          bombsPlaced: 0,
          blastRadius: s.archetype === 'brute' ? 3 : 2,
          speed: s.archetype === 'phantom' ? 4.5 : 3.5,
          hasRemote: s.archetype === 'trickster',
          hasShield: false,
          hasKick: s.archetype === 'sentinel',
          hasSkateActive: false,
          skateTicksRemaining: 0,
        },
        facing: 'down',
        powerActive: false,
        powerCooldownTicks: 0,
        powerTicksRemaining: 0,
      })),
      bombs: [],
      flames: [],
      powerUps: [],
      phase: watchOnly ? 'watching' : 'playing',
      score: 0,
      timeElapsed: 0,
    };

    // Load ghost if playing against ghost or watching replay
    if ((playAgainstGhost || watchOnly) && gameMap.ghost) {
      initialState.ghost = {
        id: 'ghost',
        position: { x: gameMap.playerSpawn.x, y: gameMap.playerSpawn.y },
        pixelPos: { x: gameMap.playerSpawn.x, y: gameMap.playerSpawn.y },
        alive: true,
        facing: 'down',
        stats: {
          maxBombs: gameMap.ghost.inputs.some(ip => ip.action === 'special') ? 2 : 1,
          bombsPlaced: 0,
          blastRadius: 2,
          speed: 4,
          hasRemote: false,
          hasShield: false,
          hasKick: false,
          hasSkateActive: false,
          skateTicksRemaining: 0,
        },
      };
    }

    stateRef.current = initialState;
    tickCounter.current = 0;
    playerInputs.current = [];
    particles.current = [];
    floatTexts.current = [];
    setWinTime(0);
    setIsNewRecord(false);
    setShareLink('');
    setGamePhase(watchOnly ? 'watching' : 'playing');

    // Setup input listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      keysPressed.current.add(e.code);

      // Trigger actions instantly for smooth keydown response
      if (stateRef.current && stateRef.current.phase === 'playing') {
        if (e.code === 'Space') {
          handlePlantBombAction('player');
        }
        if (e.code === 'KeyE') {
          handleSpecialPowerAction('player');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Setup Game Loop
    let lastTime = performance.now();
    let accumulator = 0;
    let animId: number;

    const loop = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;
      accumulator += delta;

      while (accumulator >= TICK_MS) {
        if (stateRef.current) {
          gameTick();
        }
        accumulator -= TICK_MS;
      }

      // Draw frames
      if (stateRef.current && canvasRef.current) {
        renderCanvas();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      audio.stopMusic();
    };
  }, [map, playAgainstGhost, watchOnly, restartKey]);

  // Sync mute state
  useEffect(() => {
    if (isMuted) {
      audio.stopMusic();
    } else {
      audio.startMusic();
    }
  }, [isMuted]);

  // Keyboard input translation to Direction Action
  const getPlayerInputDirection = (): Direction | 'none' => {
    if (keysPressed.current.has('ArrowUp') || keysPressed.current.has('KeyW')) return 'up';
    if (keysPressed.current.has('ArrowDown') || keysPressed.current.has('KeyS')) return 'down';
    if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('KeyA')) return 'left';
    if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('KeyD')) return 'right';
    return 'none';
  };

  // Helper to spawn visual explosion particles
  const spawnExplosionParticles = (x: number, y: number, color: string) => {
    const count = 15;
    const px = x * TILE_SIZE + TILE_SIZE / 2;
    const py = y * TILE_SIZE + TILE_SIZE / 2;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      particles.current.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 0,
        maxLife: randomInt(25, 45, gameRNG.current),
        size: randomInt(3, 7, gameRNG.current),
      });
    }
  };

  // Helper to spawn debris particles
  const spawnDebrisParticles = (x: number, y: number, color: string) => {
    const count = 10;
    const px = x * TILE_SIZE + TILE_SIZE / 2;
    const py = y * TILE_SIZE + TILE_SIZE / 2;

    for (let i = 0; i < count; i++) {
      particles.current.push({
        x: px + randomInt(-10, 10, gameRNG.current),
        y: py + randomInt(-10, 10, gameRNG.current),
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 4 - 1,
        color,
        life: 0,
        maxLife: randomInt(30, 50, gameRNG.current),
        size: randomInt(2, 5, gameRNG.current),
      });
    }
  };

  // Bomb Planting Mechanics
  const handlePlantBombAction = (ownerId: string, customRadius?: number, customTimer?: number, isRemote = false) => {
    const state = stateRef.current;
    if (!state) return;

    let targetEntity: any = null;
    if (ownerId === 'player') targetEntity = state.player;
    else if (ownerId === 'ghost') targetEntity = state.ghost;
    else targetEntity = state.bots.find(b => b.id === ownerId);

    if (!targetEntity || !targetEntity.alive) return;

    const pos = { ...targetEntity.position };

    // Prevent placing bomb on top of existing bomb
    const alreadyHasBomb = state.bombs.some(b => b.position.x === pos.x && b.position.y === pos.y);
    if (alreadyHasBomb) return;

    // Check bomb stats capacity
    const activeBombsCount = state.bombs.filter(b => b.ownerId === ownerId).length;
    if (activeBombsCount >= targetEntity.stats.maxBombs) return;

    // Add bomb
    const newBomb: BombEntity = {
      id: `${ownerId}_bomb_${Date.now()}_${Math.random()}`,
      position: pos,
      ownerId,
      radius: customRadius || targetEntity.stats.blastRadius,
      ticksRemaining: customTimer || (isRemote ? 360 : 180), // 3s normal, 6s max remote
      isRemote,
      isMoving: false,
    };

    state.bombs.push(newBomb);
    if (ownerId === 'player') {
      audio.playPlantBomb();
      // Record input
      playerInputs.current.push({
        tick: tickCounter.current,
        action: 'bomb',
        pressed: true,
      });
    }
  };

  // Special Abilities Activation
  const handleSpecialPowerAction = (ownerId: string) => {
    const state = stateRef.current;
    if (!state) return;

    if (ownerId === 'player') {
      // If player has a remote bomb active, detonate it!
      const playerRemoteBombs = state.bombs.filter(b => b.ownerId === 'player' && b.isRemote);
      if (playerRemoteBombs.length > 0) {
        playerRemoteBombs.forEach(b => {
          b.ticksRemaining = 0; // Detonates immediately in next loop update
        });
        audio.playSpecialPower();
        playerInputs.current.push({
          tick: tickCounter.current,
          action: 'special',
          pressed: true,
        });
        return;
      }

      // Check for Shield/Skate active triggers
      if (state.player.stats.hasShield) {
        // can flash visually or sound
      }
    }
  };

  // Bot Power Triggers
  const handleBotPower = (bot: BotEntity) => {
    const state = stateRef.current;
    if (!state) return;

    if (bot.archetype === 'phantom') {
      bot.phaseShiftActive = true;
      bot.powerTicksRemaining = 120; // 2 seconds
      bot.powerCooldownTicks = 480; // 8 seconds
      floatTexts.current.push({
        x: bot.position.x,
        y: bot.position.y - 0.5,
        text: 'PHASE SHIFT',
        color: '#A855F7',
        life: 40,
      });
    } else if (bot.archetype === 'brute') {
      // Plants Giant Mega Blast Bomb with radius 5, timer 1.5s (90 ticks)
      handlePlantBombAction(bot.id, 5, 90, false);
      bot.powerCooldownTicks = 720; // 12 seconds
      floatTexts.current.push({
        x: bot.position.x,
        y: bot.position.y - 0.5,
        text: 'MEGA BLAST',
        color: '#F97316',
        life: 40,
      });
    } else if (bot.archetype === 'trickster') {
      // Plants a Remote Bomb!
      handlePlantBombAction(bot.id, bot.stats.blastRadius, 360, true);
      bot.powerCooldownTicks = 300; // 5 seconds
      floatTexts.current.push({
        x: bot.position.x,
        y: bot.position.y - 0.5,
        text: 'REMOTE PLANT',
        color: '#22C55E',
        life: 40,
      });
    } else if (bot.archetype === 'sentinel') {
      // Sentinel scans and launches Freeze Bomb
      bot.lookScanTicks = 30; // 0.5s visual eye sweep
      handlePlantBombAction(bot.id, bot.stats.blastRadius + 1, 150, false); // wider radius frost bomb
      bot.powerCooldownTicks = 600; // 10s cooldown
      floatTexts.current.push({
        x: bot.position.x,
        y: bot.position.y - 0.5,
        text: 'FREEZE BOMB',
        color: '#06B6D4',
        life: 40,
      });
    }
  };

  // MAIN GAME TICK UPDATER (DETERMINISTIC RETRO LOOP)
  const gameTick = () => {
    const state = stateRef.current;
    if (!state) return;

    const map = state.map;
    const width = map.width;
    const height = map.height;

    if (state.phase !== 'playing' && state.phase !== 'watching') return;

    tickCounter.current++;
    state.tick = tickCounter.current;
    state.timeElapsed = tickCounter.current / TICK_RATE;

    // --- 1. PLAYER INPUT UPDATE & MOVEMENT ---
    if (state.player.alive && state.phase === 'playing') {
      const inputDir = getPlayerInputDirection();

      // Decrement invul ticks
      if (state.player.invulTicks > 0) state.player.invulTicks--;

      // Movement sliding helper
      slideEntity(state.player, inputDir, state);
    }

    // --- 2. GHOST ACTIONS PLAYBACK ---
    if (state.ghost && state.ghost.alive && map.ghost) {
      // Filter inputs matching current tick
      const ghostEvents = map.ghost.inputs.filter(ip => ip.tick === tickCounter.current);
      let gDir: Direction | 'none' = 'none';

      ghostEvents.forEach(ev => {
        if (ev.action === 'bomb' && ev.pressed) {
          handlePlantBombAction('ghost');
        } else if (ev.action === 'special' && ev.pressed) {
          handleSpecialPowerAction('ghost');
        } else if (ev.pressed) {
          gDir = ev.action as Direction;
        }
      });

      // Apply sliding movement to Ghost
      slideEntity(state.ghost, gDir, state);
    }

    // --- 3. BOTS AI UPDATE & DECISION CYCLE ---
    state.bots.forEach(bot => {
      if (!bot.alive) return;

      // Handle power cooldowns
      if (bot.powerCooldownTicks > 0) bot.powerCooldownTicks--;
      if (bot.powerTicksRemaining > 0) {
        bot.powerTicksRemaining--;
        if (bot.powerTicksRemaining === 0) {
          bot.phaseShiftActive = false;
        }
      }

      // Check sliding status. If fully aligned to cell, compute next AI decision!
      const isAligned =
        Math.abs(bot.pixelPos.x - bot.position.x) < 0.05 &&
        Math.abs(bot.pixelPos.y - bot.position.y) < 0.05;

      let botAction: Action = 'none';
      if (isAligned) {
        // Snap
        bot.pixelPos = { x: bot.position.x, y: bot.position.y };

        // Generate decision
        botAction = getBotAction(bot, state, gameRNG.current);

        if (botAction === 'bomb') {
          handlePlantBombAction(bot.id);
        } else if (botAction === 'special') {
          handleBotPower(bot);
        }
      }

      // If action is direction, slide toward it
      const moveDir = (['up', 'down', 'left', 'right'].includes(botAction)) ? botAction as Direction : 'none';
      slideEntity(bot, moveDir, state);
    });

    // --- 4. FLAMES DECAY ---
    state.flames = state.flames
      .map(f => ({ ...f, ticksRemaining: f.ticksRemaining - 1 }))
      .filter(f => f.ticksRemaining > 0);

    // --- 5. BOMB TICKING & EXPLOSION CHAIN SYSTEM ---
    const explodedBombIds = new Set<string>();

    // Normal ticking
    state.bombs.forEach(b => {
      if (!b.isRemote) {
        b.ticksRemaining--;
      }
    });

    // Handle instant explosions for triggered bombs
    let checkExplosions = true;
    while (checkExplosions) {
      checkExplosions = false;

      for (let i = 0; i < state.bombs.length; i++) {
        const b = state.bombs[i];
        if (b.ticksRemaining <= 0 && !explodedBombIds.has(b.id)) {
          triggerExplosion(b, state);
          explodedBombIds.add(b.id);
          checkExplosions = true; // Chain reaction could trigger another
        }
      }
    }

    // Filter out exploded bombs
    state.bombs = state.bombs.filter(b => !explodedBombIds.has(b.id));

    // --- 6. POWERUPS COLLECTION ---
    state.powerUps = state.powerUps.filter(pu => {
      // Check player overlap
      const playerOverlap = state.player.alive && state.player.position.x === pu.position.x && state.player.position.y === pu.position.y;
      if (playerOverlap) {
        applyPowerUp(state.player, pu.type);
        audio.playPowerUp();
        floatTexts.current.push({
          x: pu.position.x,
          y: pu.position.y - 0.5,
          text: pu.type.replace('_', ' ').toUpperCase(),
          color: '#10B981',
          life: 40,
        });
        return false;
      }

      // Check bot overlap
      state.bots.forEach(bot => {
        if (bot.alive && bot.position.x === pu.position.x && bot.position.y === pu.position.y) {
          applyPowerUp(bot, pu.type);
          return;
        }
      });

      return true;
    });

    // --- 7. FLAME LETHAL COLLISION CHECK (SUDDEN DEATH / GAME OVER) ---
    const flameCells = new Set<string>();
    state.flames.forEach(f => flameCells.add(`${f.position.x},${f.position.y}`));

    if (state.player.alive && state.player.invulTicks <= 0) {
      if (flameCells.has(`${state.player.position.x},${state.player.position.y}`)) {
        // Shield break or Death
        if (state.player.stats.hasShield) {
          state.player.stats.hasShield = false;
          state.player.invulTicks = 60; // 1s visual grace
          audio.playShieldBreak();
          floatTexts.current.push({
            x: state.player.position.x,
            y: state.player.position.y - 0.5,
            text: 'SHIELD BROKEN',
            color: '#F43F5E',
            life: 45,
          });
        } else {
          state.player.alive = false;
          state.phase = 'lose';
          audio.stopMusic();
          audio.playDefeat();
          spawnExplosionParticles(state.player.position.x, state.player.position.y, '#EF4444');
          setGamePhase('lose');
        }
      }
    }

    // Bots flame death
    state.bots.forEach(bot => {
      if (bot.alive && flameCells.has(`${bot.position.x},${bot.position.y}`)) {
        bot.alive = false;
        audio.playExplosion();
        spawnExplosionParticles(bot.position.x, bot.position.y, '#A855F7');
        floatTexts.current.push({
          x: bot.position.x,
          y: bot.position.y - 0.5,
          text: 'ELIMINADO',
          color: '#A855F7',
          life: 45,
        });
      }
    });

    // Ghost flame death
    if (state.ghost && state.ghost.alive && flameCells.has(`${state.ghost.position.x},${state.ghost.position.y}`)) {
      state.ghost.alive = false;
      spawnExplosionParticles(state.ghost.position.x, state.ghost.position.y, '#64748B');
    }

    // --- 8. WIN CONDITIONS ---
    const livingBots = state.bots.filter(b => b.alive).length;
    if (state.player.alive && livingBots === 0 && state.phase === 'playing') {
      state.phase = 'win';
      setGamePhase('win');
      setWinTime(state.timeElapsed);
      audio.stopMusic();
      audio.playVictory();

      // Save record!
      const isNew = savePersonalRecord(map.seed || '', map.name, state.timeElapsed);
      setIsNewRecord(isNew);
    } else if (state.phase === 'watching' && livingBots === 0) {
      state.phase = 'win';
      setGamePhase('win');
      setWinTime(state.timeElapsed);
      audio.stopMusic();
      audio.playVictory();
    }

    // Update particles life
    particles.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
    });
    particles.current = particles.current.filter(p => p.life < p.maxLife);

    // Update float text life
    floatTexts.current.forEach(t => t.life--);
    floatTexts.current = floatTexts.current.filter(t => t.life > 0);

    // Decay camera shake
    if (cameraShake.current > 0) {
      cameraShake.current -= 0.5;
    }
  };

  // Perform smooth tile movement sliding & bounds checking
  const slideEntity = (entity: any, actionDir: Direction | 'none', state: WorldState) => {
    const speed = entity.stats.speed;
    const moveAmount = speed / TICK_RATE; // distance to move in this tick

    const px = entity.pixelPos.x;
    const py = entity.pixelPos.y;
    const tx = entity.position.x;
    const ty = entity.position.y;

    const dx = tx - px;
    const dy = ty - py;

    const isAligned = Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05;

    if (isAligned) {
      // Complete alignment snap
      entity.pixelPos = { x: tx, y: ty };

      // Apply next movement direction if specified
      if (actionDir !== 'none') {
        entity.facing = actionDir;

        // Determine next cell target
        let nxtX = tx;
        let nxtY = ty;
        if (actionDir === 'up') nxtY--;
        else if (actionDir === 'down') nxtY++;
        else if (actionDir === 'left') nxtX--;
        else if (actionDir === 'right') nxtX++;

        // Verify next cell is walkable
        const tile = state.map.tiles[nxtY]?.[nxtX];
        const isPhantomShift = entity.id !== 'player' && entity.archetype === 'phantom' && entity.phaseShiftActive;

        let blocked = false;
        if (tile === 'solid') blocked = true;
        if (tile === 'destructible' && !isPhantomShift) blocked = true;

        // Check if bomb blocks
        const hasBombBlock = state.bombs.some(b => b.position.x === nxtX && b.position.y === nxtY);
        if (hasBombBlock) {
          blocked = true;
          // Kick power! Kick bomb in movement direction
          if (entity.stats.hasKick) {
            const bombToKick = state.bombs.find(b => b.position.x === nxtX && b.position.y === nxtY);
            if (bombToKick && !bombToKick.isMoving) {
              bombToKick.isMoving = true;
              bombToKick.moveDir = actionDir;
              audio.playMove();
            }
          }
        }

        if (!blocked) {
          entity.position = { x: nxtX, y: nxtY };
        }
      }
    } else {
      // Continue sliding smoothly toward target grid coordinate
      const stepX = Math.sign(dx) * Math.min(Math.abs(dx), moveAmount);
      const stepY = Math.sign(dy) * Math.min(Math.abs(dy), moveAmount);

      entity.pixelPos.x += stepX;
      entity.pixelPos.y += stepY;

      // Bobbing walking SFX on footsteps triggers periodically
      if (entity.id === 'player' && tickCounter.current % 15 === 0) {
        audio.playMove();
      }
    }

    // Log player action events for Ghost determinism
    if (entity.id === 'player') {
      playerInputs.current.push({
        tick: tickCounter.current,
        action: actionDir === 'none' ? 'none' : actionDir,
        pressed: actionDir !== 'none',
      });
    }
  };

  // Bomb Explosion Blast Calculations
  const triggerExplosion = (bomb: BombEntity, state: WorldState) => {
    const map = state.map;
    const width = map.width;
    const height = map.height;

    audio.playExplosion();
    cameraShake.current = 8; // trigger high-energy visual feedback shake!

    // Add epicenter flame
    const fEpicenter: FlameEntity = {
      id: `flame_epic_${bomb.id}_${Date.now()}`,
      position: bomb.position,
      ticksRemaining: 40, // flame lasts 0.6s
      isEpicenter: true,
    };
    state.flames.push(fEpicenter);
    spawnExplosionParticles(bomb.position.x, bomb.position.y, '#F97316');

    // Expand blast in 4 directions
    const dirs: { x: number; y: number; direction: Direction }[] = [
      { x: 0, y: -1, direction: 'up' },
      { x: 0, y: 1, direction: 'down' },
      { x: -1, y: 0, direction: 'left' },
      { x: 1, y: 0, direction: 'right' },
    ];

    dirs.forEach(d => {
      for (let dist = 1; dist <= bomb.radius; dist++) {
        const tx = bomb.position.x + d.x * dist;
        const ty = bomb.position.y + d.y * dist;

        if (tx < 0 || tx >= width || ty < 0 || ty >= height) break;

        const tile = map.tiles[ty][tx];

        // Hit solid block - blast is absorbed completely
        if (tile === 'solid') {
          break;
        }

        // Add flame segment
        const fSegment: FlameEntity = {
          id: `flame_${bomb.id}_${d.direction}_${dist}`,
          position: { x: tx, y: ty },
          ticksRemaining: 40,
          isEpicenter: false,
          direction: d.direction,
        };
        state.flames.push(fSegment);

        // Chain Reaction trigger: trigger adjacent ticking bombs instantly!
        const chainBomb = state.bombs.find(b => b.position.x === tx && b.position.y === ty);
        if (chainBomb) {
          chainBomb.ticksRemaining = 0; // Trigger immediately next while loop cycle
        }

        // Hit destructible block - destroy it, stop blast, spawn random powerup!
        if (tile === 'destructible') {
          map.tiles[ty][tx] = 'floor'; // destroy
          spawnDebrisParticles(tx, ty, '#78350F');

          // Decide powerup spawn chance
          if (gameRNG.current() < map.powerUpConfig.spawnChance) {
            // Select weighted powerup
            const puType = getWeightedPowerup(map.powerUpConfig.weights);
            state.powerUps.push({
              id: `powerup_${tx}_${ty}_${Date.now()}`,
              position: { x: tx, y: ty },
              type: puType,
            });
          }
          break;
        }
      }
    });
  };

  // Weighted item choice selection
  const getWeightedPowerup = (weights: Record<PowerUpType, number>): PowerUpType => {
    const keys = Object.keys(weights) as PowerUpType[];
    const total = keys.reduce((sum, k) => sum + weights[k], 0);
    const rnd = gameRNG.current() * total;

    let accum = 0;
    for (const key of keys) {
      accum += weights[key];
      if (rnd <= accum) {
        return key;
      }
    }
    return 'blast_up';
  };

  // Apply visual stats boost
  const applyPowerUp = (entity: any, type: PowerUpType) => {
    const stats = entity.stats;
    if (type === 'blast_up') {
      stats.blastRadius = Math.min(8, stats.blastRadius + 1);
    } else if (type === 'bomb_up') {
      stats.maxBombs = Math.min(8, stats.maxBombs + 1);
    } else if (type === 'speed_up') {
      stats.speed = Math.min(7, stats.speed + 0.5);
    } else if (type === 'remote_bomb') {
      stats.hasRemote = true;
    } else if (type === 'shield') {
      stats.hasShield = true;
    } else if (type === 'kick') {
      stats.hasKick = true;
    } else if (type === 'skate') {
      stats.hasSkateActive = true;
      stats.skateTicksRemaining = 600; // 10 seconds of speed double!
      stats.speed = stats.speed * 1.5;
    }
  };

  // CANVAS ARTISTIC 2D RENDERER (Legibility is first priority!)
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = stateRef.current;
    if (!state) return;

    const map = state.map;

    // Apply Camera Screen Shake
    ctx.save();
    if (cameraShake.current > 0) {
      const dx = (Math.random() - 0.5) * cameraShake.current;
      const dy = (Math.random() - 0.5) * cameraShake.current;
      ctx.translate(dx, dy);
    }

    // Clear Screen
    ctx.fillStyle = '#F5F5F4'; // Warm light canvas tone
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // DRAW BASE TILES GRID (FLOOR / WALLS / COLUMNS)
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        const isOuter = x === 0 || x === map.width - 1 || y === 0 || y === map.height - 1;
        const isPillar = x % 2 === 0 && y % 2 === 0;

        if (isOuter || isPillar) {
          // HEAVY STONE COLUMN / WALL
          ctx.fillStyle = '#292524'; // Warm granite charcoal
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

          // Dark 3D bottom shade bevel border
          ctx.fillStyle = '#1C1917';
          ctx.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 4);

          // Light highlight top border
          ctx.fillStyle = '#44403C';
          ctx.fillRect(px, py, TILE_SIZE, 3);
        } else {
          // CLEAN COZY WALKABLE FLOOR
          const tile = map.tiles[y][x];

          if (tile === 'floor') {
            ctx.fillStyle = '#FAF7F2'; // Crisp off-white cream background
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            // Subtle micro lines grid texture
            ctx.strokeStyle = '#E7E5E4';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

            // Flower dots / breathing grass tufts procedurally
            if ((x + y) % 5 === 0) {
              ctx.fillStyle = '#A3E635'; // Vibrant green microdots
              ctx.fillRect(px + 12, py + 14, 2, 2);
              ctx.fillRect(px + 14, py + 12, 2, 2);
            }
          } else if (tile === 'destructible') {
            // CRATE / CLAY BLOCK
            ctx.fillStyle = '#78350F'; // Rich brick brown
            ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);

            // Shading
            ctx.strokeStyle = '#451A03';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);

            // Crates diagonal crossed straps
            ctx.beginPath();
            ctx.moveTo(px + 4, py + 4);
            ctx.lineTo(px + TILE_SIZE - 4, py + TILE_SIZE - 4);
            ctx.moveTo(px + TILE_SIZE - 4, py + 4);
            ctx.lineTo(px + 4, py + TILE_SIZE - 4);
            ctx.stroke();
          }
        }
      }
    }

    // DRAW POWERUPS (FLOAT GENTLY VIA SINE WAVE)
    state.powerUps.forEach(pu => {
      const px = pu.position.x * TILE_SIZE + TILE_SIZE / 2;
      const py = pu.position.y * TILE_SIZE + TILE_SIZE / 2;

      // Gentle vertical hover animation
      const hoverOffset = Math.sin(tickCounter.current * 0.08) * 4;

      ctx.save();
      ctx.translate(px, py + hoverOffset);

      // Radial outer glowing pulse
      const gradient = ctx.createRadialGradient(0, 0, 4, 0, 0, 16);
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();

      // Card base bubble
      ctx.fillStyle = '#10B981'; // Mint Green
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner icon label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      let text = '⚡';
      if (pu.type === 'blast_up') text = '🔥';
      else if (pu.type === 'bomb_up') text = '💣';
      else if (pu.type === 'speed_up') text = '👟';
      else if (pu.type === 'remote_bomb') text = '📡';
      else if (pu.type === 'shield') text = '🛡️';
      else if (pu.type === 'kick') text = '🦶';
      else if (pu.type === 'skate') text = '🛹';

      ctx.fillText(text, 0, 0);
      ctx.restore();
    });

    // DRAW ACTIVE BOMB TICKING SQUASH & BREATH
    state.bombs.forEach(b => {
      const px = b.position.x * TILE_SIZE + TILE_SIZE / 2;
      const py = b.position.y * TILE_SIZE + TILE_SIZE / 2;

      // Breathing animation scale
      const pulseSpeed = b.isRemote ? 0.04 : 0.08 * (1 + (180 - b.ticksRemaining) / 60);
      const breathScale = 1 + Math.sin(tickCounter.current * pulseSpeed) * 0.12;

      ctx.save();
      ctx.translate(px, py);
      ctx.scale(breathScale, breathScale);

      // Draw Bomb body circle
      let bombColor = '#292524'; // Charcoal standard
      if (b.isRemote) {
        bombColor = '#14532D'; // Green trickster remote
      }
      ctx.fillStyle = bombColor;
      ctx.beginPath();
      ctx.arc(0, 2, 14, 0, Math.PI * 2);
      ctx.fill();

      // Spark fuse
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.quadraticCurveTo(6, -18, 10, -14);
      ctx.stroke();

      // Fuse fire dot sparkle blinking
      ctx.fillStyle = tickCounter.current % 10 < 5 ? '#F59E0B' : '#EF4444';
      ctx.beginPath();
      ctx.arc(10, -14, 3, 0, Math.PI * 2);
      ctx.fill();

      // Bomb glossy white reflection highlight
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-5, -3, 3, 0, Math.PI * 2);
      ctx.fill();

      // Overlay specific symbols for Special bombs
      if (b.radius > 4) {
        // Brute Giant Bomb - Skull indicator
        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀', 0, 2);
      } else if (b.isRemote) {
        // Blinking Remote LED
        ctx.fillStyle = tickCounter.current % 15 < 7 ? '#22C55E' : '#052E16';
        ctx.beginPath();
        ctx.arc(0, 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });

    // DRAW DYNAMIC ELIPSE EXPANDING FLAMES (HIGH ENERGY EXPRESIVE!)
    state.flames.forEach(f => {
      const px = f.position.x * TILE_SIZE + TILE_SIZE / 2;
      const py = f.position.y * TILE_SIZE + TILE_SIZE / 2;

      const alpha = f.ticksRemaining / 40;
      ctx.save();
      ctx.translate(px, py);

      // Core fire ball gradient pulsing elastically
      const pulseRadius = TILE_SIZE / 2 * (1.1 - Math.sin(f.ticksRemaining * 0.2) * 0.1);
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, pulseRadius);
      grad.addColorStop(0, `rgba(254, 240, 138, ${alpha})`); // Yellow core
      grad.addColorStop(0.3, `rgba(249, 115, 22, ${alpha})`); // Orange middle
      grad.addColorStop(0.8, `rgba(239, 68, 68, ${alpha * 0.8})`); // Red boundaries
      grad.addColorStop(1, 'rgba(220, 38, 38, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Tiny floating spark particles within flame coordinates
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect((Math.sin(tickCounter.current) * 10), -f.ticksRemaining % 20, 2, 2);

      ctx.restore();
    });

    // DRAW COMPANION GHOST (FANTASMA)
    if (state.ghost && state.ghost.alive) {
      const gX = state.ghost.pixelPos.x * TILE_SIZE + TILE_SIZE / 2;
      const gY = state.ghost.pixelPos.y * TILE_SIZE + TILE_SIZE / 2;

      ctx.save();
      ctx.translate(gX, gY);
      ctx.globalAlpha = 0.40; // Faded transparent aesthetic

      // Hover phantom ripple wave
      const bobY = Math.sin(tickCounter.current * 0.08) * 3;

      // Draw Ghost body (Teal aura)
      ctx.fillStyle = '#14B8A6';
      ctx.beginPath();
      ctx.arc(0, bobY, 13, 0, Math.PI * 2);
      ctx.fill();

      // Little ghost tails trailing bottom
      ctx.beginPath();
      ctx.moveTo(-13, bobY);
      ctx.lineTo(-13, bobY + 14);
      ctx.quadraticCurveTo(-6, bobY + 10, 0, bobY + 14);
      ctx.quadraticCurveTo(6, bobY + 10, 13, bobY + 14);
      ctx.lineTo(13, bobY);
      ctx.closePath();
      ctx.fill();

      // Faded cyan eyes
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-4, bobY - 2, 3, 0, Math.PI * 2);
      ctx.arc(4, bobY - 2, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(-4, bobY - 1, 1, 0, Math.PI * 2);
      ctx.arc(4, bobY - 1, 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // DRAW PLAYER (CHARISMATIC BOUNCING SQUASH)
    if (state.player.alive) {
      const pX = state.player.pixelPos.x * TILE_SIZE + TILE_SIZE / 2;
      const pY = state.player.pixelPos.y * TILE_SIZE + TILE_SIZE / 2;

      // Invul blink
      const isVisible = state.player.invulTicks === 0 || tickCounter.current % 6 < 3;

      if (isVisible) {
        ctx.save();
        ctx.translate(pX, pY);

        // Gentle walking bounce squash
        const isWalking =
          Math.abs(state.player.pixelPos.x - state.player.position.x) > 0.02 ||
          Math.abs(state.player.pixelPos.y - state.player.position.y) > 0.02;
        const bobScaleY = isWalking ? 1 + Math.sin(tickCounter.current * 0.25) * 0.08 : 1;
        const bobScaleX = isWalking ? 1 - Math.sin(tickCounter.current * 0.25) * 0.05 : 1;
        ctx.scale(bobScaleX, bobScaleY);

        // Player shadow
        ctx.fillStyle = 'rgba(28, 25, 23, 0.25)';
        ctx.beginPath();
        ctx.ellipse(0, 14, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Helmet/Visor circular base
        ctx.fillStyle = '#3B82F6'; // Royal Blue classic bomber
        ctx.beginPath();
        ctx.arc(0, -2, 14, 0, Math.PI * 2);
        ctx.fill();

        // White antenna fluff
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, -18, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(0, -16);
        ctx.stroke();

        // Black/Yellow glossy visor mask facing side
        ctx.fillStyle = '#1E293B';
        let visorOffset = { x: 0, y: -2 };
        if (state.player.facing === 'left') visorOffset = { x: -4, y: -2 };
        else if (state.player.facing === 'right') visorOffset = { x: 4, y: -2 };
        else if (state.player.facing === 'up') visorOffset = { x: 0, y: -4 };

        ctx.beginPath();
        ctx.ellipse(visorOffset.x, visorOffset.y, 9, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glimmer eyes inside visor
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(visorOffset.x - 3, visorOffset.y, 1.5, 0, Math.PI * 2);
        ctx.arc(visorOffset.x + 3, visorOffset.y, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Power-Up specific visual aura details
        if (state.player.stats.hasShield) {
          // Purple shield aura bubble
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, -2, 19, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    // DRAW BOTS AI AGENTS (WITH CUSTOM ARCHETYPE DESIGNS!)
    state.bots.forEach(bot => {
      if (!bot.alive) return;

      const bX = bot.pixelPos.x * TILE_SIZE + TILE_SIZE / 2;
      const bY = bot.pixelPos.y * TILE_SIZE + TILE_SIZE / 2;

      ctx.save();
      ctx.translate(bX, bY);

      // Shadow
      ctx.fillStyle = 'rgba(28, 25, 23, 0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 14, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Custom Archetype visual parameters
      let baseColor = '#A855F7'; // Phantom purple
      let scale = 1;
      let alpha = 1;

      if (bot.archetype === 'phantom') {
        baseColor = '#A855F7';
        alpha = bot.phaseShiftActive ? 0.4 : 0.75;
      } else if (bot.archetype === 'brute') {
        baseColor = '#EA580C'; // Red Orange
        scale = 1.35; // Brute is significantly larger!
      } else if (bot.archetype === 'trickster') {
        baseColor = '#22C55E'; // Green neon
        // Continuously bouncing up and down!
        ctx.translate(0, Math.abs(Math.sin(tickCounter.current * 0.15)) * -7);
      } else if (bot.archetype === 'sentinel') {
        baseColor = '#06B6D4'; // Cyan metallic
      }

      ctx.globalAlpha = alpha;
      ctx.scale(scale, scale);

      // Character body
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(0, -2, 11, 0, Math.PI * 2);
      ctx.fill();

      // Eyes/Visor Mask
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.ellipse(0, -2, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Angry eyes for bots
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-5, -4); ctx.lineTo(-1, -2);
      ctx.moveTo(5, -4); ctx.lineTo(1, -2);
      ctx.stroke();

      // Sentinel Scanning visual sweep effect
      if (bot.archetype === 'sentinel' && bot.lookScanTicks && bot.lookScanTicks > 0) {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -2, 20 - (bot.lookScanTicks % 10) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Phantom trail particles
      if (bot.archetype === 'phantom' && tickCounter.current % 12 === 0) {
        particles.current.push({
          x: bX,
          y: bY,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          color: '#D8B4FE',
          life: 0,
          maxLife: 20,
          size: 3,
        });
      }

      ctx.restore();
    });

    // DRAW FLYING / FLOATING DEBRIS PARTICLES
    particles.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 1 - p.life / p.maxLife;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });

    // DRAW FLOAT SCORE TEXTS AND "?" ACTIONS
    floatTexts.current.forEach(ft => {
      const tx = ft.x * TILE_SIZE + TILE_SIZE / 2;
      const ty = ft.y * TILE_SIZE - (40 - ft.life) * 0.4; // float upwards

      ctx.save();
      ctx.translate(tx, ty);
      ctx.fillStyle = ft.color;
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 4;
      ctx.font = 'black 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    });

    ctx.restore(); // end screen shake save
  };

  // Generate a direct link for this arena
  const handleCopyLink = () => {
    const link = generateShareURL(map);
    setShareLink(link);
    navigator.clipboard.writeText(link);
  };

  const handleShareResult = () => {
    if (stateRef.current) {
      const currentRunGhost: GhostRecord = {
        version: 1,
        mapSeed: map.seed || '',
        playerName: 'Jogador',
        completedAt: tickCounter.current,
        result: 'win',
        inputs: playerInputs.current,
      };
      const link = generateShareURL(map, currentRunGhost);
      setShareLink(link);
      navigator.clipboard.writeText(link);
    }
  };

  // Quick restart mapping
  const handleRestart = () => {
    audio.playClick();
    setRestartKey(k => k + 1);
  };

  return (
    <div className="flex flex-col min-h-screen bg-neutral-900 text-white font-sans overflow-hidden">
      {/* HUD Bar */}
      <header className="flex justify-between items-center px-6 py-4 bg-neutral-950 border-b border-neutral-800 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              audio.playClick();
              onBack();
            }}
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-black tracking-widest text-amber-500 uppercase">
              {playAgainstGhost ? 'Desafio contra Fantasma' : 'Modo Solo'}
            </span>
            <h2 className="text-sm font-black text-neutral-100 truncate max-w-[150px] sm:max-w-xs">{map.name}</h2>
          </div>
        </div>

        {/* Real-time stats HUD display */}
        <div className="flex items-center gap-4 text-xs font-mono font-bold">
          <div className="flex items-center gap-1 bg-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-800">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>
              {stateRef.current
                ? (gamePhase === 'win' ? winTime : stateRef.current.timeElapsed).toFixed(1)
                : '0.0'}s
            </span>
          </div>

          <div className="flex items-center gap-1 bg-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-800">
            <Users className="w-4 h-4 text-purple-400" />
            <span>
              {stateRef.current
                ? stateRef.current.bots.filter(b => b.alive).length
                : '0'} INIMIGOS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
            title={isMuted ? 'Ativar Música' : 'Mudar Som'}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Arena Stage Workspace */}
      <div
        ref={containerRef}
        className="flex-grow flex flex-col items-center justify-center p-4 overflow-hidden relative"
      >
        <div className="relative rounded-2xl shadow-2xl border-4 border-neutral-950 bg-neutral-950 overflow-hidden">
          {/* Main 2D Gameplay Canvas */}
          <canvas
            ref={canvasRef}
            width={DEFAULT_MAP_WIDTH * TILE_SIZE}
            height={DEFAULT_MAP_HEIGHT * TILE_SIZE}
            className="max-w-full block aspect-[15/13] pointer-events-none"
          />
        </div>

        {/* Mobile touch controls D-Pad (only renders on responsive mobile devices) */}
        <div className="mt-4 w-full max-w-lg md:hidden">
          <TouchDpad
            onDirectionPress={(dir) => {
              if (stateRef.current && stateRef.current.phase === 'playing') {
                if (dir === 'none') {
                  keysPressed.current.delete('KeyW');
                  keysPressed.current.delete('KeyS');
                  keysPressed.current.delete('KeyA');
                  keysPressed.current.delete('KeyD');
                } else {
                  keysPressed.current.clear();
                  if (dir === 'up') keysPressed.current.add('KeyW');
                  else if (dir === 'down') keysPressed.current.add('KeyS');
                  else if (dir === 'left') keysPressed.current.add('KeyA');
                  else if (dir === 'right') keysPressed.current.add('KeyD');
                }
              }
            }}
            onBombPress={() => handlePlantBombAction('player')}
            onSpecialPress={() => handleSpecialPowerAction('player')}
          />
        </div>
      </div>

      {/* RESULTS / GAME STATE SCREEN OVERLAYS */}
      <AnimatePresence>
        {gamePhase !== 'playing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-neutral-900 border border-neutral-800 text-white p-8 rounded-3xl w-full max-w-md shadow-2xl flex flex-col items-center text-center"
            >
              {gamePhase === 'win' && (
                <>
                  <div className="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center shadow-lg mb-4 animate-bounce">
                    <Trophy className="w-8 h-8 text-neutral-900" />
                  </div>
                  <span className="text-xs font-black tracking-widest text-amber-500 uppercase">Vitória Gloriosa!</span>
                  <h1 className="text-2xl font-black mt-1">Desafio Superado!</h1>
                  
                  <div className="grid grid-cols-2 gap-3 w-full my-6 font-mono bg-neutral-950 p-4 border border-neutral-800 rounded-2xl">
                    <div className="text-center border-r border-neutral-800">
                      <span className="text-[10px] text-neutral-500 font-bold block">Tempo de Conclusão</span>
                      <span className="text-lg font-black text-amber-400">{winTime.toFixed(2)}s</span>
                    </div>
                    <div className="text-center">
                      <span className="text-[10px] text-neutral-500 font-bold block">Estatuto de Recorde</span>
                      <span className="text-lg font-black text-emerald-400">
                        {isNewRecord ? 'Novo Best! 🎉' : 'Consistente'}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-400 max-w-xs mb-6">
                    Seu percurso determinístico foi capturado com sucesso! Você pode compartilhar seu mapa com seu fantasma embutido para desafiar seus amigos.
                  </p>
                </>
              )}

              {gamePhase === 'lose' && (
                <>
                  <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-lg mb-4">
                    <Flame className="w-8 h-8 text-white animate-pulse" />
                  </div>
                  <span className="text-xs font-black tracking-widest text-red-500 uppercase">Eliminado</span>
                  <h1 className="text-2xl font-black mt-1">Explosão Fatal!</h1>
                  <p className="text-xs text-neutral-400 max-w-xs my-5">
                    Os bots ou suas próprias bombas fecharam o cerco. Lembre-se: chutar bombas ou usar um escudo ajudam na sobrevivência!
                  </p>
                </>
              )}

              {gamePhase === 'watching' && (
                <>
                  <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center shadow-lg mb-4">
                    <Tv className="w-8 h-8 text-white" />
                  </div>
                  <span className="text-xs font-black tracking-widest text-blue-400 uppercase">Modo Espectador</span>
                  <h1 className="text-2xl font-black mt-1">Reproduzindo Replay</h1>
                  <p className="text-xs text-neutral-400 max-w-xs my-5">
                    Você está assistindo uma reprodução determinística gravada. Observe os caminhos e as reações para aprender novas táticas!
                  </p>
                </>
              )}

              <div className="flex flex-col gap-2 w-full mt-2">
                {gamePhase === 'win' && (
                  <button
                    onClick={handleShareResult}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black rounded-xl text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Share2 className="w-4 h-4" />
                    Compartilhar com meu Fantasma
                  </button>
                )}

                <button
                  onClick={handleRestart}
                  className="w-full py-3 bg-white hover:bg-neutral-100 text-neutral-900 font-black rounded-xl text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  Jogar Novamente
                </button>

                <button
                  onClick={() => {
                    audio.playClick();
                    onBack();
                  }}
                  className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-black rounded-xl text-xs tracking-wider uppercase transition-all"
                >
                  Voltar ao Menu Principal
                </button>
              </div>

              {shareLink && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs text-amber-400 font-mono text-left w-full flex justify-between items-center overflow-x-auto gap-2"
                >
                  <span className="truncate max-w-[80%]">{shareLink}</span>
                  <span className="text-[9px] uppercase font-black bg-amber-500 text-neutral-950 px-1.5 py-0.5 rounded">Copiado!</span>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
