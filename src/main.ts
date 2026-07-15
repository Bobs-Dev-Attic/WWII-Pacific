import './styles.css';
import { Landing, type Selection } from './ui/landing';
import { Game } from './game/Game';

// App shell: swaps between the landing/mission-select flow and an active sortie.

const app = document.getElementById('app')!;
const menuRoot = document.createElement('div');
menuRoot.id = 'menu-root';
app.appendChild(menuRoot);

const gameRoot = document.createElement('div');
gameRoot.id = 'game-root';
gameRoot.style.position = 'fixed';
gameRoot.style.inset = '0';
app.appendChild(gameRoot);

let game: Game | null = null;
let lastSelection: Selection | null = null;

const landing = new Landing(menuRoot, launch);

function showMenu(): void {
  menuRoot.style.display = '';
  gameRoot.style.display = 'none';
  landing.show();
}

function launch(sel: Selection): void {
  lastSelection = sel;
  menuRoot.style.display = 'none';
  gameRoot.style.display = '';
  game?.destroy();
  game = new Game(gameRoot, {
    side: sel.side,
    battle: sel.battle,
    onExitToMenu: () => {
      game = null;
      showMenu();
    },
    onRestart: () => {
      if (lastSelection) launch(lastSelection);
      else showMenu();
    },
  });
  game.start();
}

showMenu();

// Prevent iOS double-tap zoom / pull-to-refresh interfering with controls.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if ((e as TouchEvent).touches.length > 1) e.preventDefault();
}, { passive: false });
