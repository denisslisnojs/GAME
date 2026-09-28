// Мини-помощники для DOM-интерфейса поверх холста Phaser.

type Attrs = Record<string, string | number | boolean | EventListener | undefined> & { class?: string; style?: string };
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'style') {
      el.setAttribute('style', String(v));
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function uiRoot(): HTMLElement {
  return document.getElementById('ui')!;
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function panel(cls: string, ...children: Child[]): HTMLDivElement {
  return h('div', { class: `panel ${cls}` }, h('div', { class: 'rivets' }), ...children);
}

export function btn(label: Child, onClick: () => void, cls = '', disabled = false, title?: string): HTMLButtonElement {
  const b = h('button', { class: `btn ${cls}`, title }, label);
  b.disabled = disabled;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) {
      sfxClick();
      onClick();
    }
  });
  return b;
}

export function img(src: string, cls = 'px', style = ''): HTMLImageElement {
  return h('img', { src, class: cls, style, draggable: 'false', alt: '' });
}

/** Модальное окно. Возвращает функцию закрытия. */
export function openModal(content: HTMLElement, opts: { onClose?: () => void; closeOnBack?: boolean } = {}): () => void {
  const back = h('div', { class: 'modal-back' }, content);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    opts.onClose?.();
  };
  if (opts.closeOnBack !== false) {
    back.addEventListener('pointerdown', (e) => {
      if (e.target === back) close();
    });
  }
  uiRoot().append(back);
  return close;
}

let toastBox: HTMLElement | null = null;

export function toast(text: string, ms = 2600) {
  if (!toastBox || !toastBox.isConnected) {
    toastBox = h('div', { class: 'toasts' });
    document.body.append(toastBox);
  }
  const t = h('div', { class: 'toast' }, text);
  toastBox.append(t);
  while (toastBox.children.length > 4) toastBox.firstChild?.remove();
  setTimeout(() => t.remove(), ms);
}

export function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 4 - n));
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// Короткий «щелчок» интерфейса через WebAudio (без файлов).
let clickCtx: AudioContext | null = null;
let sfxVolume = 0.5;

export function setSfxVolume(v: number) {
  sfxVolume = v;
}

export function getSfxVolume() {
  return sfxVolume;
}

export function sfxClick() {
  if (sfxVolume <= 0) return;
  try {
    clickCtx ??= new AudioContext();
    const ctx = clickCtx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.05);
    g.gain.setValueAtTime(0.05 * sfxVolume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.08);
  } catch {
    /* звук недоступен */
  }
}

export function sfxCoins() {
  if (sfxVolume <= 0) return;
  try {
    clickCtx ??= new AudioContext();
    const ctx = clickCtx;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.06;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1800 + i * 300, t);
      g.gain.setValueAtTime(0.04 * sfxVolume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.13);
    }
  } catch {
    /* звук недоступен */
  }
}
