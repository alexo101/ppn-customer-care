export const DEFAULT_CTA_COLOR = "#0EA5E9";
export const DEFAULT_BACKGROUND_COLOR = "#F8FAFC";

export type AppearanceColors = {
  ctaColor: string;
  backgroundColor: string;
};

export function isHexColor(value: string): boolean {
  return /^#([0-9A-Fa-f]{6})$/.test(value.trim());
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!isHexColor(trimmed)) return null;
  return trimmed.toUpperCase();
}

export function contrastHex(hex: string): string {
  return relativeLuminance(hex) > 0.55 ? "#0F172A" : "#FFFFFF";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = (normalizeHexColor(hex) ?? DEFAULT_CTA_COLOR).slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
