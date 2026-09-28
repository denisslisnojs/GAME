import '@fontsource/ruslan-display';
import '@fontsource/kurale';
import { drawFigure, STYLES } from './render';
import { flipFigure } from './figures';
import { KIT_BLUE, KIT_RED, peasant, plateKnight, soldier, type Kit } from './figures2';
import { fence, stoneWall, toSepia, townScene } from './town';
import { battleBg, mapFragment } from './scenes';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'figs';
const root = document.getElementById('root')!;
const KNIGHT_KIT: Kit = { ...KIT_BLUE, steel: '#6e7c8e' };

function show(c: HTMLCanvasElement, scale: number, parent: HTMLElement = root) {
  c.style.width = c.width * scale + 'px';
  c.style.height = c.height * scale + 'px';
  parent.append(c);
}

async function main() {
  await document.fonts.load('40px "Ruslan Display"', 'Стань сильнееWarfare');
  await document.fonts.load('20px "Kurale"', 'Стань');
  if (mode === 'figs') {
    const st = { ...STYLES[q.get('style') ?? 'hd'] };
    st.k = +(q.get('k') ?? 3);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;align-items:flex-end;padding:10px;background:#c8b890';
    root.append(row);
    for (const f of [peasant(KIT_BLUE), soldier(KIT_BLUE), plateKnight(KNIGHT_KIT), flipFigure(soldier(KIT_RED))]) show(drawFigure(f, st), +(q.get('s') ?? 2), row);
  } else if (mode === 'showcase') {
    const W = 740;
    const H = 415;
    const ground = 330;
    const sepia = q.get('bg') === 'sepia';
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const town = townScene(W, H, ground);
    ctx.drawImage(sepia ? toSepia(town, 0.42) : town, 0, 0);
    if (sepia) {
      const f = fence(W, 46);
      ctx.drawImage(toSepia(f, 0.3), 0, ground - 40);
    }
    const st = { ...STYLES.ref, k: +(q.get('k') ?? 2.5) };
    const figs = [peasant(KIT_BLUE), soldier(KIT_BLUE), plateKnight(KNIGHT_KIT)];
    const xs = [150, 330, 510];
    figs.forEach((f, i) => {
      const c = drawFigure(f, st);
      ctx.fillStyle = 'rgba(20,14,10,0.28)';
      ctx.beginPath();
      ctx.ellipse(xs[i] + 2, H - 20, 34, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(c, xs[i] - c.width / 2, H - 22 - c.height + 6);
    });
    if (!sepia) {
      const wall = stoneWall(W, 18);
      ctx.drawImage(wall, 0, H - 18);
    }
    // заголовок-лента
    ctx.fillStyle = '#1a1210';
    ctx.fillRect(0, 34, W, 34);
    ctx.fillStyle = '#6a2a1a';
    ctx.fillRect(0, 36, W, 1);
    ctx.fillRect(0, 65, W, 1);
    ctx.font = '30px "Ruslan Display"';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2a1a10';
    ctx.fillText(q.get('title') ?? 'Стань сильнее', W / 2 + 2, 63);
    ctx.fillStyle = '#e2b43c';
    ctx.fillText(q.get('title') ?? 'Стань сильнее', W / 2, 61);
    show(cv, 2);
  } else if (mode === 'battle') {
    const style = q.get('style') ?? 'ref';
    const W = 740;
    const H = 415;
    const bgStyle = style === 'ref' ? 'hd' : style;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(battleBg(bgStyle, W, H, false), 0, 0);
    const st = { ...STYLES[style], k: style === 'dusk' ? 1.3 : 1.35 };
    const blueK = { ...KNIGHT_KIT };
    const units: { f: ReturnType<typeof soldier>; x: number; y: number }[] = [];
    const rows = [H * 0.6, H * 0.72, H * 0.84, H * 0.96];
    const mk = [(k: Kit) => soldier(k), (k: Kit) => plateKnight(k), (k: Kit) => soldier(k), (k: Kit) => peasant(k)];
    rows.forEach((y, r) => {
      for (let i = 0; i < 3; i++) units.push({ f: mk[(i + r) % 4](i === 1 ? blueK : KIT_BLUE), x: 90 + i * 70 + r * 14 + (r % 2) * 20, y });
      for (let i = 0; i < 3; i++) units.push({ f: flipFigure(mk[(i + r + 1) % 4](KIT_RED)), x: 440 + i * 70 - r * 10 + (r % 2) * 18, y });
    });
    units.sort((a, b) => a.y - b.y);
    for (const u of units) {
      const c = drawFigure(u.f, st);
      ctx.fillStyle = 'rgba(20,14,10,0.25)';
      ctx.beginPath();
      ctx.ellipse(u.x, u.y - 3, 20, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(c, Math.round(u.x - c.width / 2), Math.round(u.y - c.height + 2));
    }
    // стрелы в полёте
    ctx.strokeStyle = style === 'dusk' ? '#1d1428' : '#2a1e14';
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const x = 300 + ((i * 53) % 140);
      const y = 110 + ((i * 37) % 70);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 12, y + 4);
      ctx.stroke();
    }
    show(cv, 2);
  } else if (mode === 'maps') {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,720px);gap:8px;padding:8px;background:#111';
    root.append(grid);
    for (const [style, name] of [['hd', 'Детальный пиксель'], ['manuscript', 'Рукопись (портолан)'], ['dark', 'Мрачная гравюра'], ['dusk', 'Закат']]) {
      const box = document.createElement('div');
      box.style.cssText = 'position:relative';
      show(mapFragment(style, 360, 200), 2, box);
      const t = document.createElement('div');
      t.textContent = name;
      t.style.cssText = 'position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.65);padding:2px 8px;font-size:18px';
      box.append(t);
      grid.append(box);
    }
  }
  (window as unknown as { __done: boolean }).__done = true;
}
void main();
