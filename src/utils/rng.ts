/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Seeded Random Number Generator using Mulberry32 algorithm.
 * Returns a function that generates a pseudo-random float between 0 and 1.
 */
export function createRNG(seedStr: string): () => number {
  // Simple hash of string to a 32-bit integer seed
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619) >>> 0;
  }
  let seed = h;

  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a random integer in [min, max] (inclusive) using the provided RNG.
 */
export function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Pick a random element from an array.
 */
export function randomChoice<T>(arr: T[], rng: () => number): T {
  const index = Math.floor(rng() * arr.length);
  return arr[index];
}

/**
 * Shuffle an array in-place using the Fisher-Yates algorithm.
 */
export function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const newArr = [...arr];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = newArr[i];
    newArr[i] = newArr[j];
    newArr[j] = temp;
  }
  return newArr;
}
