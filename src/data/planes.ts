// Aircraft performance data — semi-authentic values scaled for arcade-sim play.
// Speeds are stored in m/s (converted from historical mph/knots), masses in kg.
// These feed the flight model (thrust, wing area, mass) and combat balance.

export type Side = 'usa' | 'japan';

export interface PlaneSpec {
  id: string;
  name: string;
  side: Side;
  role: 'fighter' | 'dive-bomber' | 'torpedo';
  // Physical / flight-model inputs
  mass: number; // kg (loaded)
  wingArea: number; // m^2
  maxThrust: number; // N (scaled) at full throttle
  maxSpeed: number; // m/s level top speed (used for drag tuning)
  stallSpeed: number; // m/s clean stall
  climbRate: number; // m/s best climb
  rollRate: number; // deg/s max roll authority
  turnRate: number; // deg/s sustained (pitch/yaw authority scalar)
  // Combat
  guns: number; // number of forward guns
  gunDamage: number; // per-hit damage
  fireRate: number; // rounds/sec (combined)
  ammo: number; // rounds
  bombs: number; // number of bombs carried
  hp: number; // structural hit points
  // Cosmetic (low-poly colors)
  bodyColor: number;
  wingColor: number;
  accentColor: number;
  blurb: string;
}

export const PLANES: Record<string, PlaneSpec> = {
  f4f_wildcat: {
    id: 'f4f_wildcat',
    name: 'F4F Wildcat',
    side: 'usa',
    role: 'fighter',
    mass: 3600,
    wingArea: 24.2,
    maxThrust: 42000,
    maxSpeed: 145,
    stallSpeed: 32,
    climbRate: 11,
    rollRate: 85,
    turnRate: 42,
    guns: 4,
    gunDamage: 9,
    fireRate: 42,
    ammo: 1440,
    bombs: 0,
    hp: 140,
    bodyColor: 0x3a5f7d,
    wingColor: 0x2e4d66,
    accentColor: 0xe8e8e8,
    blurb: 'Rugged US Navy carrier fighter. Tough, well-armed, dives beautifully.',
  },
  f6f_hellcat: {
    id: 'f6f_hellcat',
    name: 'F6F Hellcat',
    side: 'usa',
    role: 'fighter',
    mass: 4200,
    wingArea: 31,
    maxThrust: 56000,
    maxSpeed: 165,
    stallSpeed: 34,
    climbRate: 14,
    rollRate: 92,
    turnRate: 46,
    guns: 6,
    gunDamage: 10,
    fireRate: 48,
    ammo: 2400,
    bombs: 2,
    hp: 170,
    bodyColor: 0x36566f,
    wingColor: 0x2b4557,
    accentColor: 0xf0f0f0,
    blurb: 'The Ace Maker. Fast, heavy-hitting, and forgiving — the Zero-killer.',
  },
  sbd_dauntless: {
    id: 'sbd_dauntless',
    name: 'SBD Dauntless',
    side: 'usa',
    role: 'dive-bomber',
    mass: 4700,
    wingArea: 30.2,
    maxThrust: 40000,
    maxSpeed: 115,
    stallSpeed: 30,
    climbRate: 8,
    rollRate: 62,
    turnRate: 34,
    guns: 2,
    gunDamage: 8,
    fireRate: 24,
    ammo: 720,
    bombs: 3,
    hp: 160,
    bodyColor: 0x2f4a5e,
    wingColor: 0x263d4d,
    accentColor: 0xdadada,
    blurb: 'Slow but deadly dive-bomber. Won Midway. Perfect-dive pipper bombing.',
  },
  a6m_zero: {
    id: 'a6m_zero',
    name: 'A6M Zero',
    side: 'japan',
    role: 'fighter',
    mass: 2700,
    wingArea: 22.4,
    maxThrust: 40000,
    maxSpeed: 150,
    stallSpeed: 28,
    climbRate: 15,
    rollRate: 105,
    turnRate: 55,
    guns: 2,
    gunDamage: 12,
    fireRate: 20,
    ammo: 600,
    bombs: 0,
    hp: 95,
    bodyColor: 0x8c9b6a,
    wingColor: 0x76854f,
    accentColor: 0xb23a48,
    blurb: 'Legendary maneuverability and climb. Turns inside anything — but fragile.',
  },
  d3a_val: {
    id: 'd3a_val',
    name: 'D3A Val',
    side: 'japan',
    role: 'dive-bomber',
    mass: 3800,
    wingArea: 34.9,
    maxThrust: 34000,
    maxSpeed: 108,
    stallSpeed: 29,
    climbRate: 7,
    rollRate: 58,
    turnRate: 32,
    guns: 2,
    gunDamage: 8,
    fireRate: 22,
    ammo: 680,
    bombs: 2,
    hp: 130,
    bodyColor: 0x7f8f5f,
    wingColor: 0x6a7a4c,
    accentColor: 0xb23a48,
    blurb: 'Fixed-gear dive bomber. Struck Pearl Harbor and sank Allied carriers.',
  },
  b5n_kate: {
    id: 'b5n_kate',
    name: 'B5N Kate',
    side: 'japan',
    role: 'torpedo',
    mass: 4100,
    wingArea: 37.7,
    maxThrust: 33000,
    maxSpeed: 105,
    stallSpeed: 27,
    climbRate: 6,
    rollRate: 52,
    turnRate: 30,
    guns: 1,
    gunDamage: 7,
    fireRate: 14,
    ammo: 500,
    bombs: 2,
    hp: 140,
    bodyColor: 0x74855a,
    wingColor: 0x61714a,
    accentColor: 0xb23a48,
    blurb: 'Torpedo bomber that crippled the US fleet at Pearl Harbor.',
  },
};

export function planesForSide(side: Side): PlaneSpec[] {
  return Object.values(PLANES).filter((p) => p.side === side);
}

export function enemySideOf(side: Side): Side {
  return side === 'usa' ? 'japan' : 'usa';
}

// Default enemy fighter used to populate opposing formations.
export function enemyFighterFor(side: Side): PlaneSpec {
  return side === 'usa' ? PLANES.a6m_zero : PLANES.f6f_hellcat;
}
