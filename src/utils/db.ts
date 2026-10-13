/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BomberMap, PersonalRecord } from '../types';

const MAPS_KEY = 'bomberweb_custom_maps';
const RECORDS_KEY = 'bomberweb_personal_records';

/**
 * Save a custom map to localStorage.
 * Keeps up to 20 custom maps.
 */
export function saveCustomMap(map: BomberMap): void {
  try {
    const maps = getCustomMaps();
    // Overwrite if same name, otherwise prepend
    const index = maps.findIndex(m => m.name.toLowerCase() === map.name.toLowerCase());
    if (index !== -1) {
      maps[index] = map;
    } else {
      maps.unshift(map);
    }

    // Keep max 20 custom maps
    if (maps.length > 20) {
      maps.pop();
    }

    localStorage.setItem(MAPS_KEY, JSON.stringify(maps));
  } catch (err) {
    console.error('Error saving custom map:', err);
  }
}

/**
 * Get all custom maps saved in localStorage.
 */
export function getCustomMaps(): BomberMap[] {
  try {
    const data = localStorage.getItem(MAPS_KEY);
    if (!data) return [];
    return JSON.parse(data) as BomberMap[];
  } catch (err) {
    console.error('Error reading custom maps:', err);
    return [];
  }
}

/**
 * Delete a custom map by name.
 */
export function deleteCustomMap(name: string): void {
  try {
    const maps = getCustomMaps();
    const filtered = maps.filter(m => m.name.toLowerCase() !== name.toLowerCase());
    localStorage.setItem(MAPS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Error deleting custom map:', err);
  }
}

/**
 * Save a personal speedrun score/record (best time).
 */
export function savePersonalRecord(seed: string, mapName: string, timeInSeconds: number): boolean {
  try {
    const records = getPersonalRecords();
    const key = seed || mapName;
    const existing = records.find(r => r.seed === key);

    let isNewRecord = false;
    if (existing) {
      if (timeInSeconds < existing.bestTime) {
        existing.bestTime = timeInSeconds;
        existing.completedAt = new Date().toISOString();
        isNewRecord = true;
      }
    } else {
      records.push({
        seed: key,
        mapName,
        bestTime: timeInSeconds,
        completedAt: new Date().toISOString(),
      });
      isNewRecord = true;
    }

    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    return isNewRecord;
  } catch (err) {
    console.error('Error saving personal record:', err);
    return false;
  }
}

/**
 * Get all personal records.
 */
export function getPersonalRecords(): PersonalRecord[] {
  try {
    const data = localStorage.getItem(RECORDS_KEY);
    if (!data) return [];
    return JSON.parse(data) as PersonalRecord[];
  } catch (err) {
    console.error('Error reading personal records:', err);
    return [];
  }
}
