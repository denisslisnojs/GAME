// Палитры местностей для фона поля боя (рисуется в backdrop.ts).

export type BattleTerrain = 'grass' | 'forest' | 'steppe' | 'desert' | 'snow' | 'dry';

export interface Palette {
  sky: [string, string, string, string];
  sun: string;
  cloud: [string, string, string];
  clouds: number;
  far: string;
  farBack: string;
  farSnow: boolean;
  mid: string;
  midTree: string;
  ground: [string, string, string];
  dirt: string;
  tuft: string;
  flowers: string[];
}

export const PAL: Record<BattleTerrain, Palette> = {
  grass: {
    sky: ['#5d86bf', '#7ea3d2', '#a6c3e3', '#cfe0ee'], sun: '#fff4d8', cloud: ['#ffffff', '#e6edf6', '#b4c6dc'], clouds: 14,
    far: '#6e82a0', farBack: '#93a6c0', farSnow: true, mid: '#5e8a46', midTree: '#3a6a34',
    ground: ['#6b8a45', '#5f7d3c', '#7a9a50'], dirt: '#6b5438', tuft: '#8ab05a', flowers: ['#f0f0f4', '#f0d050', '#b870c8', '#e05a4a'],
  },
  forest: {
    sky: ['#56809f', '#7598b8', '#9ab8d0', '#c0d4e2'], sun: '#fff0d0', cloud: ['#f8fafc', '#dfe7ef', '#a8bccd'], clouds: 16,
    far: '#5e7490', farBack: '#8498b0', farSnow: false, mid: '#3f6636', midTree: '#2c4e28',
    ground: ['#5a7a3c', '#4e6d34', '#688a48'], dirt: '#5a4630', tuft: '#7a9a4a', flowers: ['#f0f0e8', '#e8c040', '#d06a3a'],
  },
  steppe: {
    sky: ['#6e9ed4', '#8fb6e0', '#b4cfea', '#dce8f2'], sun: '#fff6de', cloud: ['#ffffff', '#eef2f8', '#c4d0e0'], clouds: 7,
    far: '#8e8e9c', farBack: '#aab0c0', farSnow: false, mid: '#a39c5e', midTree: '#7a7446',
    ground: ['#b0a862', '#a39b58', '#bdb570'], dirt: '#8a7448', tuft: '#d8d09a', flowers: ['#e8e0f0', '#c8a0d8'],
  },
  desert: {
    sky: ['#c9955a', '#e0b27a', '#eccb98', '#f6e2bc'], sun: '#fff4d0', cloud: ['#fff6e6', '#f2e2c8', '#d8c09c'], clouds: 3,
    far: '#c08a5a', farBack: '#d8ae80', farSnow: false, mid: '#d8b070', midTree: '#6a7a3a',
    ground: ['#dcb56d', '#d2aa62', '#e6c47e'], dirt: '#b48a50', tuft: '#a88a50', flowers: [],
  },
  snow: {
    sky: ['#7d8ea4', '#98a8bc', '#b4c2d2', '#d2dce6'], sun: '#f4f6fa', cloud: ['#eef2f6', '#d2dae4', '#a4b0c0'], clouds: 20,
    far: '#7a889c', farBack: '#a0acbc', farSnow: true, mid: '#c8d2dc', midTree: '#2e4d3a',
    ground: ['#e6ecf0', '#d6dee6', '#f2f5f7'], dirt: '#b8c0c8', tuft: '#7a8a6a', flowers: [],
  },
  dry: {
    sky: ['#6e98c4', '#8eb2d6', '#b2cbe4', '#d6e3ee'], sun: '#fff2d4', cloud: ['#ffffff', '#ebeff4', '#c0ccdc'], clouds: 8,
    far: '#8e8074', farBack: '#b0a498', farSnow: false, mid: '#8f9650', midTree: '#4e5e30',
    ground: ['#9ca155', '#8c924a', '#abaa62'], dirt: '#8a6e48', tuft: '#c0b070', flowers: ['#f0e0a0', '#e8e8e8'],
  },
};

