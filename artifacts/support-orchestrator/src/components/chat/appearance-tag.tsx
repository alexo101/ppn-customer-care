import type { CSSProperties } from "react";
import type { AppearanceTagStyle } from "@workspace/api-client-react";
import { contrastHex, hexToRgba } from "@/lib/appearance-theme";
import { cn } from "@/lib/utils";

export const MAX_TAG_CHARS = 20;
export const DEFAULT_TAG_STYLE: AppearanceTagStyle = "solid";

export const TAG_STYLE_OPTIONS: { id: AppearanceTagStyle; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "outline", label: "Outline" },
  { id: "soft", label: "Soft" },
];

export function isTagStyle(value: string | null | undefined): value is AppearanceTagStyle {
  return value === "solid" || value === "outline" || value === "soft";
}

type AppearanceTagProps = {
  text?: string | null;
  style?: AppearanceTagStyle;
  ctaColor: string;
  /** Use when the tag sits on the CTA-colored chat header so it stays readable. */
  tone?: "default" | "onCta";
  className?: string;
};

export function AppearanceTag({
  text,
  style = DEFAULT_TAG_STYLE,
  ctaColor,
  tone = "default",
  className,
}: AppearanceTagProps) {
  const label = text?.trim() ?? "";
  if (!label) return null;

  const onCta = contrastHex(ctaColor);
  const fill = tone === "onCta" ? onCta : ctaColor;
  const ink = tone === "onCta" ? ctaColor : onCta;
  const styles: Record<AppearanceTagStyle, CSSProperties> = {
    solid: {
      backgroundColor: fill,
      color: ink,
      borderColor: fill,
    },
    outline: {
      backgroundColor: "transparent",
      color: fill,
      borderColor: fill,
    },
    soft: {
      backgroundColor: hexToRgba(fill, tone === "onCta" ? 0.22 : 0.16),
      color: fill,
      borderColor: "transparent",
    },
  };

  return (
    <span
      className={cn(
        "inline-flex max-w-[9rem] items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none tracking-wide truncate",
        className,
      )}
      style={styles[style]}
    >
      {label}
    </span>
  );
}
