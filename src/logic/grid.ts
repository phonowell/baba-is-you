export const keyFor = (x: number, y: number, width: number): number =>
  y * width + x

export const inBounds = (
  x: number,
  y: number,
  width: number,
  height: number,
): boolean => x >= 0 && y >= 0 && x < width && y < height
