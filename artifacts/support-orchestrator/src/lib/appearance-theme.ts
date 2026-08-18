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

export function hexToHslCss(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return `${h} ${s}% ${l}%`;
}

export function contrastHex(hex: string): string {
  return relativeLuminance(hex) > 0.55 ? "#0F172A" : "#FFFFFF";
}

export function applyCtaCssVars(target: HTMLElement, ctaColor: string): void {
  const normalized = normalizeHexColor(ctaColor) ?? DEFAULT_CTA_COLOR;
  const primary = hexToHslCss(normalized);
  const foreground = hexToHslCss(contrastHex(normalized));
  target.style.setProperty("--primary", primary);
  target.style.setProperty("--primary-foreground", foreground);
  target.style.setProperty("--ring", primary);
  target.style.setProperty("--sidebar-primary", primary);
}

export function clearCtaCssVars(target: HTMLElement): void {
  target.style.removeProperty("--primary");
  target.style.removeProperty("--primary-foreground");
  target.style.removeProperty("--ring");
  target.style.removeProperty("--sidebar-primary");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = (normalizeHexColor(hex) ?? DEFAULT_CTA_COLOR).slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r1:
        h = (g1 - b1) / d + (g1 < b1 ? 6 : 0);
        break;
      case g1:
        h = (b1 - r1) / d + 2;
        break;
      default:
        h = (r1 - g1) / d + 4;
        break;
    }
    h *= 60;
  }
  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
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
