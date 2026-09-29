// Картинки, нарисованные в двойном разрешении (портреты, фигуры воинов): показываются со сглаживанием,
// а не «квадратиками», как пиксельные значки.

const SMOOTH = new Set<string>();

export function markSmooth(url: string): string {
  SMOOTH.add(url);
  return url;
}

/** Класс для картинки: пиксельный «px» заменяется на сглаженный «sm», если картинка гладкая. */
export function pxClass(src: string, cls: string): string {
  return SMOOTH.has(src) ? cls.replace(/\bpx\b/, 'sm') : cls;
}
