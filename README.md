# Wings of War — WWII Pacific Flight Simulator

A low-poly, mobile-first WWII flight simulator set in the **Pacific Theater**. Fly for
the **Americans** or the **Japanese** across famous battles, with semi-authentic flight
physics, animated control surfaces, ballistic gunnery & bombing, and enemy fighters that
fly historical formations and attack patterns.

> Built with **Vite + TypeScript + Three.js**. Runs in any modern browser, tuned for
> touch on phones and keyboard on desktop. Deployed on **Vercel**.

The current version is shown on the landing page (side-select screen).

---

## Features

### Choose your side & battle
- Play as the **United States** (Wildcat, Hellcat, Dauntless) or the **Empire of Japan**
  (A6M Zero, D3A Val, B5N Kate).
- Seven famous Pacific battles: **Pearl Harbor, Coral Sea, Midway, Guadalcanal,
  Philippine Sea, Leyte Gulf, Okinawa** — each with its own weather, time of day, sea
  state, wind, objective and enemy composition.

### Semi-realistic flight physics
- Thrust, **gravity/weight**, **lift** (angle-of-attack driven with a real stall), and
  **drag** (parasitic + induced) integrated on a rigid body.
- **Wind & weather** feed the relative airflow — gusts push the airframe around and must
  be led for accurate gunnery and bombing.
- Air density falls with altitude, thinning engine thrust and lift.
- Control authority scales with airspeed — controls go mushy when slow or stalled.

### Animated, characterful aircraft
- Low-poly airframes with **animated control surfaces**: ailerons, elevator, rudder and
  a spinning propeller all react to your inputs and the plane's attitude.

### Combat
- **Ballistic guns** with tracer fire, bullet drop and wind drift.
- **Bombing** with a predictive **impact pipper** that accounts for your velocity,
  gravity and wind.
- Objectives: **air superiority**, **strike enemy ships**, or **defend the fleet**.

### Enemy AI
- Fighters spawn in **historical formations** — the Japanese three-plane *shotai* vic and
  the American *finger-four*.
- Attack patterns: formation patrol, **pursuit onto your six**, aligned gun runs,
  **break-turn evasion**, energy **boom-and-zoom** for heavier fighters, and late-war
  **kamikaze** dives against ships.

---

## Controls

**Touch (mobile)**
- Left **virtual joystick** — pitch (vertical) & roll (horizontal)
- Right **throttle slider**, **FIRE** and **BOMB** buttons, **yaw** buttons, **VIEW** toggle

**Keyboard (desktop)**
- `W`/`S` or `↑`/`↓` pitch · `A`/`D` or `←`/`→` roll · `Q`/`E` rudder
- `Shift`/`Ctrl` throttle · `Space` fire · `B` bomb · `V` toggle chase/cockpit view

---

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

## Deployment (Vercel)

The repo is connected to **Vercel** and configured via `vercel.json` (framework: `vite`,
output: `dist`). Deployment is fully automated from Git:

- **Push a branch / open a PR** → Vercel builds a **preview** deployment for that commit.
- **Merge to `main`** → Vercel promotes a fresh **production** build.

Because deploys are driven by Git, every version bump and change tracked in
`CHANGELOG.md` ships automatically on merge — no manual upload step.

## Versioning

The version is the single source of truth in [`src/version.ts`](src/version.ts) (kept in
sync with `package.json`) and is displayed on the landing page. All changes are tracked in
[`CHANGELOG.md`](CHANGELOG.md).
