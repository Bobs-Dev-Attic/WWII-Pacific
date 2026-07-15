# Changelog

All notable changes to **Wings of War — WWII Pacific Flight Simulator** are documented
here. The version displayed on the landing page is defined in `src/version.ts` and kept in
sync with `package.json`.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [1.1.0] — "Glass Cockpit" — 2026-07-15

Instruments, navigation and combat-visuals overhaul.

### Added
- **Glass-cockpit flight instruments** (floating, semi-transparent SVG gauges):
  - **Airspeed indicator** (dial + needle).
  - **Attitude indicator** — artificial horizon with a pitch ladder, bank pointer
    and a slip/skid bubble (the pitch/yaw bubble).
  - **Altimeter** dial with a digital thousands window.
  - **Heading indicator / compass** with a rotating rose and digital heading, plus
    a G-load readout.
  - **Fuel gauge** with an empty-side red arc and low-fuel warning.
- **Fuel system**: endurance burns with throttle; a dead engine forces the prop to
  windmill and the aircraft to glide.
- **Radar mini-map** (heading-up) plotting enemies, ships and the objective, with
  distant contacts clamped to the rim as direction arrows, and range-to-objective.
- **Objective guidance arrow** under the compass that rotates toward the objective
  with a live distance readout.
- **Battle map page** (MAP button / `M` key): a north-up, auto-scaled overview of
  the whole battlefield — player heading, enemy fighters, enemy/friendly ships,
  islands and the objective — with a legend. Opening it pauses the sortie.
- **Enhanced weapons visuals**: brighter, longer tracer streaks with additive
  glowing heads, plus **muzzle flashes** on every burst (player and enemy).

### Changed
- Replaced the plain numeric six-pack readout with the analog instrument cluster;
  the remaining text HUD is now a compact status strip (objective, enemies, ammo,
  bombs, hull, wind, stall/fuel warnings).

## [1.0.0] — "Rising Sun" — 2026-07-15

Initial playable release.

### Added
- **Landing / mission-select flow** with the game version shown on the side-select
  screen, choice of side (United States / Empire of Japan), and selection of seven famous
  Pacific battles (Pearl Harbor, Coral Sea, Midway, Guadalcanal, Philippine Sea, Leyte
  Gulf, Okinawa).
- **Semi-realistic flight model**: thrust, gravity/weight, angle-of-attack lift with soft
  stall, parasitic + induced drag, altitude-dependent air density, and airspeed-scaled
  control authority.
- **Wind & weather system** driving relative airflow, gusts, fog, sky tint and lighting
  per battle (clear / scattered / overcast / storm; dawn / day / dusk; sea state).
- **Low-poly aircraft** (6 types) with **animated control surfaces** — ailerons,
  elevator, rudder and spinning propeller reacting to inputs and attitude.
- **Combat**: ballistic tracer guns with bullet drop & wind drift; gravity/wind-affected
  bombing with a predictive impact pipper; enemy ships and friendly-fleet targets.
- **Enemy squadron AI**: historical formations (Japanese *shotai* vic, American
  *finger-four*) and attack patterns (patrol, pursuit-to-six, gun runs, break-turn
  evasion, boom-and-zoom energy tactics, late-war kamikaze dives).
- **Objectives**: air superiority, strike enemy ships, defend the fleet — with win/lose
  evaluation and an outcome screen.
- **Controls**: on-screen touch (virtual joystick, throttle slider, fire/bomb/yaw/view
  buttons) and full keyboard mapping.
- **HUD**: airspeed, altitude, heading, G-force, throttle, hull integrity, ammo, bombs,
  wind, objective progress, stall warning, crosshair and bomb pipper.
- **Vercel deployment** configuration (`vercel.json`) and Vite production build.

[1.0.0]: https://github.com/bobs-dev-attic/wwii-pacific/releases/tag/v1.0.0
