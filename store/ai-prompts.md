# Промпты для ChatGPT / Gemini — красивые картинки для Google Play

Всё, что нужно для публикации, уже лежит в папке `store/` и собрано из самой игры. Промпты ниже нужны,
если хочется «дорогой» рисованной обложки, иконки или рекламных баннеров.

**Как пользоваться**
1. Открой ChatGPT (генерация картинок) или Gemini.
2. Приложи файлы-референсы, указанные у промпта: они задают стиль игры.
3. Вставь промпт целиком, он на английском: так генераторы работают стабильнее.
4. Если результат понравился, пришли его мне. Я подгоню размер под требования Google Play и наложу
   название и слоган на четырёх языках, так же, как в текущей обложке `store/feature-graphic-*.jpg`.

**Правила Google Play для графики** (иначе карточку могут отклонить):
- Никаких «№1», «лучшая игра», «бесплатно», «скачай сейчас», звёзд рейтинга и наград.
- Картинка должна честно показывать игру: не рисуй то, чего в ней нет (реалистичную 3D-графику, драконов, магию).
- Важное держи в центре кадра: края обложки иногда обрезаются.

---

## 1. Обложка (Feature graphic), 1024 × 500 — самое важное

Это большой баннер вверху страницы игры. **Референсы:** `store/feature-bg.jpg`, `store/emblem.png`,
`store/screenshots/raw/en/03-siege.jpg`.

Генераторы не умеют рисовать ровно 1024 × 500, поэтому проси широкий кадр 16:9 или 2:1. Я потом обрежу его до 1024 × 500.

```
Create a wide key-art illustration for a mobile strategy game called "Warfare 1347" (aspect ratio 2:1, landscape).

Match the art style of the attached game screenshots exactly: clean painted 2D cartoon style, chunky "chibi" soldier proportions — big helmeted heads, wide torsos, short thick legs, oversized heraldic shields — thick dark outlines, soft cel shading, bright saturated colours. Not realistic, not 3D, not anime.

Scene: an epic medieval battle in 1347 on rolling green hills with patchwork fields, a windmill and snowy mountains far behind, dramatic golden late-afternoon light and a few painted clouds. In the centre-right, a wedge of heavy knights on blue barded horses (blue shields with a gold cross) crashes into a shield wall of northern warriors in red with round shields and axes. Lances splinter, banners fly: a blue banner with a gold star on the left, a red banner on the right. In the background a stone castle on a hill with archers on the walls. Dust and motion, but no gore.

Composition: keep the LEFT 40% of the image calmer and darker (sky, distant hills, soft vignette) — the game title will be placed there later. Keep all important action inside the central safe area, nothing important at the very edges.

Do not add any text, letters, logos, watermarks or UI.
```

**Вариант с названием прямо на картинке.** Латиницу генераторы обычно пишут ровно. Добавь в конец промпта:

```
Add the title "WARFARE 1347" on the left side in a bold medieval display font, golden letters with a dark brown outline and a soft shadow, and above it a red heraldic shield with a golden crown over two crossed swords (like the attached emblem). No other text.
```

---

## 2. Иконка приложения, 512 × 512

**Референсы:** `store/icon-512.png` (текущая иконка) и `store/emblem.png`.

```
Redraw the attached app icon as a polished, premium mobile game icon, 1:1 square, 1024x1024.

Keep the same idea and colours: a red heraldic heater shield with a thick gold rim and a golden jewelled crown on it, two crossed steel swords with gold crossguards and pommels behind the shield, on a warm dark-brown background with a soft golden radial glow and subtle light rays.

Style: clean painted 2D game art with thick dark outlines, glossy highlights on the metal and gold, soft cel shading, strong readable silhouette that still reads at 48x48 pixels. Centered, filling about 80% of the square, full-bleed background to the edges (no rounded corners, no border, no transparent areas).

No text, no letters, no numbers.
```

После генерации пришли картинку мне: я уменьшу её до 512 × 512 для Google Play и пересоберу из неё иконки для телефона (все размеры и адаптивную).

---

## 3. Рекламный баннер / соцсети (по желанию)

Пригодится для рекламы в Google Ads, постов и превью видео. **Референсы:** `store/screenshots/raw/en/01-battle.jpg`,
`store/screenshots/raw/en/02-map.jpg`, `store/emblem.png`.

**Горизонтальный 1200 × 628 (16:9)**
```
Create a promotional banner for the mobile medieval strategy game "Warfare 1347", landscape 16:9.

Same art style as the attached screenshots: clean painted 2D cartoon art, chunky soldiers with big helmeted heads and oversized heraldic shields, thick dark outlines, soft cel shading, bright colours.

Left half: a hero knight in shining Gothic plate armour with a blue-and-gold heraldic shield, riding a horse in blue barding, sword raised, charging toward the viewer. Right half: a painted parchment-style map of medieval Europe with small castles, towns, banners and army markers, fading into a battle of blue knights against red northern warriors at the bottom.

Warm golden light, dust, flying banners. Leave clear space at the top for a title. No text, no logos, no UI.
```

**Квадрат 1080 × 1080** — тот же промпт, но в начале замени `landscape 16:9` на `square 1:1`, а композицию на:
```
Composition: the hero knight in the centre foreground, a besieged stone castle with archers on the walls behind him, armies clashing on both sides. Leave space at the top for a title.
```

**Вертикальный 1080 × 1920 (Stories, Shorts)** — в начале замени на `portrait 9:16`, а композицию на:
```
Composition: from top to bottom — sky with a flying blue banner (space for a title), a stone castle on a hill, the charging knight in the middle, a shield wall of red warriors at the bottom.
```

---

## Что уже готово в `store/`

| Файл | Для чего | Размер |
|---|---|---|
| `icon-512.png` | Иконка приложения в Google Play | 512 × 512 |
| `feature-graphic-{ru,en,pt,tr}.jpg` | Обложка (Feature graphic) на каждом языке | 1024 × 500 |
| `screenshots/captioned/<язык>/` | Скриншоты с подписями, 9 штук на язык — загружать в «Скриншоты телефона» | 1920 × 1080 |
| `screenshots/raw/<язык>/` | Те же кадры без подписей (для планшетов, соцсетей, референсов) | 1920 × 1080 |
| `feature-bg.jpg`, `emblem.png` | Кадр боя без интерфейса и герб на прозрачном фоне — референсы для ИИ | — |
| `listing.md` | Тексты страницы на 4 языках | — |
