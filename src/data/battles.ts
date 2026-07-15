// Famous WWII Pacific Theater battles selectable from the landing screen.
// Each battle tunes the environment (weather, time of day, sea state), the
// objective, and the enemy composition/formation the player faces.

import type { Side } from './planes';

export type Weather = 'clear' | 'scattered' | 'overcast' | 'storm';
export type TimeOfDay = 'dawn' | 'day' | 'dusk';
export type Objective = 'air-superiority' | 'strike-ships' | 'defend-fleet';

export interface BattleSpec {
  id: string;
  name: string;
  date: string;
  location: string;
  summary: string;
  // Environment
  weather: Weather;
  timeOfDay: TimeOfDay;
  windDir: number; // degrees, direction wind blows toward
  windSpeed: number; // m/s base wind
  seaState: number; // 0 calm .. 3 rough (wave amplitude)
  // Mission
  objective: Objective;
  enemyCount: number; // opposing fighters
  shipTargets: number; // number of enemy ships (for strike/defend)
  friendlyShips: number;
  // Which side historically was on the offensive (affects starting altitude/spawn)
  aggressor: Side;
  tags: string[];
}

export const BATTLES: BattleSpec[] = [
  {
    id: 'pearl_harbor',
    name: 'Pearl Harbor',
    date: 'Dec 7, 1941',
    location: 'Oahu, Hawaii',
    summary:
      'The surprise dawn strike that brought America into the war. Japanese carriers launch waves against Battleship Row.',
    weather: 'scattered',
    timeOfDay: 'dawn',
    windDir: 45,
    windSpeed: 4,
    seaState: 1,
    objective: 'strike-ships',
    enemyCount: 4,
    shipTargets: 6,
    friendlyShips: 0,
    aggressor: 'japan',
    tags: ['Carrier Strike', 'Surprise Attack', 'Torpedo Run'],
  },
  {
    id: 'coral_sea',
    name: 'Coral Sea',
    date: 'May 4–8, 1942',
    location: 'Coral Sea, SW Pacific',
    summary:
      'The first carrier-vs-carrier battle in history — fought entirely by aircraft, ships never sighting each other.',
    weather: 'scattered',
    timeOfDay: 'day',
    windDir: 120,
    windSpeed: 6,
    seaState: 2,
    objective: 'strike-ships',
    enemyCount: 6,
    shipTargets: 4,
    friendlyShips: 2,
    aggressor: 'usa',
    tags: ['Carrier Duel', 'Dive Bombing', 'First of Its Kind'],
  },
  {
    id: 'midway',
    name: 'Midway',
    date: 'Jun 4–7, 1942',
    location: 'Midway Atoll',
    summary:
      'The turning point of the Pacific War. Dauntless dive-bombers catch four Japanese carriers with decks full of fuel and ordnance.',
    weather: 'clear',
    timeOfDay: 'day',
    windDir: 300,
    windSpeed: 5,
    seaState: 1,
    objective: 'strike-ships',
    enemyCount: 8,
    shipTargets: 4,
    friendlyShips: 3,
    aggressor: 'usa',
    tags: ['Turning Point', 'Dive Bombing', 'Carrier Kill'],
  },
  {
    id: 'guadalcanal',
    name: 'Guadalcanal',
    date: 'Aug 1942 – Feb 1943',
    location: 'Solomon Islands',
    summary:
      'The brutal grinding campaign for Henderson Field. Daily dogfights over "the Slot" between Wildcats and Zeros.',
    weather: 'overcast',
    timeOfDay: 'day',
    windDir: 200,
    windSpeed: 7,
    seaState: 2,
    objective: 'air-superiority',
    enemyCount: 9,
    shipTargets: 2,
    friendlyShips: 1,
    aggressor: 'japan',
    tags: ['Attrition', 'Dogfight', 'The Slot'],
  },
  {
    id: 'philippine_sea',
    name: 'Philippine Sea',
    date: 'Jun 19–20, 1944',
    location: 'Mariana Islands',
    summary:
      'The "Great Marianas Turkey Shoot." Hellcats slaughter waves of inexperienced Japanese pilots in a lopsided air battle.',
    weather: 'clear',
    timeOfDay: 'day',
    windDir: 90,
    windSpeed: 5,
    seaState: 1,
    objective: 'defend-fleet',
    enemyCount: 12,
    shipTargets: 0,
    friendlyShips: 4,
    aggressor: 'japan',
    tags: ['Turkey Shoot', 'Fleet Defense', 'Massed Attack'],
  },
  {
    id: 'leyte_gulf',
    name: 'Leyte Gulf',
    date: 'Oct 23–26, 1944',
    location: 'Philippines',
    summary:
      'The largest naval battle in history. Desperate Japanese counterattacks and the first organized kamikaze strikes.',
    weather: 'scattered',
    timeOfDay: 'dusk',
    windDir: 160,
    windSpeed: 8,
    seaState: 2,
    objective: 'defend-fleet',
    enemyCount: 10,
    shipTargets: 3,
    friendlyShips: 5,
    aggressor: 'japan',
    tags: ['Largest Naval Battle', 'Kamikaze', 'Fleet Defense'],
  },
  {
    id: 'okinawa',
    name: 'Okinawa',
    date: 'Apr–Jun 1945',
    location: 'Ryukyu Islands',
    summary:
      'The last great battle. Massed kamikaze waves (Kikusui) hurl themselves at the invasion fleet through foul weather.',
    weather: 'storm',
    timeOfDay: 'day',
    windDir: 250,
    windSpeed: 12,
    seaState: 3,
    objective: 'defend-fleet',
    enemyCount: 14,
    shipTargets: 2,
    friendlyShips: 6,
    aggressor: 'japan',
    tags: ['Kamikaze Waves', 'Storm', 'Final Battle'],
  },
];

export function battleById(id: string): BattleSpec | undefined {
  return BATTLES.find((b) => b.id === id);
}
