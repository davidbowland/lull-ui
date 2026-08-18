export type Rgb = [number, number, number]

export const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb

export const relativeLuminance = ([red, green, blue]: Rgb): number => {
  const channel = (value: number): number => {
    const ratio = value / 255
    return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

// WCAG 2.1 relative-contrast ratio, 1:1 to 21:1. Order-independent.
export const contrastRatio = (first: string, second: string): number => {
  const [lighter, darker] = [hexToRgb(first), hexToRgb(second)]
    .map(relativeLuminance)
    .toSorted((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}
