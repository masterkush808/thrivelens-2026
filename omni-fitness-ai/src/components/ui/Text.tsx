import React from "react";
import { Text as RNText, TextProps as RNTextProps } from "react-native";

type TextVariant =
  | "display" | "h1" | "h2" | "h3"
  | "bodyLarge" | "body" | "bodySmall" | "caption" | "button"
  | "stat" | "statSmall" | "statLarge";

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  className?: string;
}

const variantClasses: Record<TextVariant, string> = {
  display: "text-display font-semibold tracking-[-1.3px] text-text-primary",
  h1: "text-h1 font-semibold tracking-[-0.8px] text-text-primary",
  h2: "text-h2 font-semibold tracking-[-0.4px] text-text-primary",
  h3: "text-h3 font-semibold tracking-[-0.2px] text-text-primary",
  bodyLarge: "text-body-lg font-normal text-text-primary",
  body: "text-body font-normal text-text-primary",
  bodySmall: "text-body-sm font-normal text-text-secondary",
  caption: "text-caption font-medium tracking-[0.2px] text-text-tertiary",
  button: "text-button font-semibold tracking-[0.2px] text-text-primary",
  stat: "text-stat font-semibold tracking-[-0.8px] tabular-nums text-text-primary",
  statSmall: "text-stat-sm font-semibold tracking-[-0.3px] tabular-nums text-text-primary",
  statLarge: "text-stat-lg font-semibold tracking-[-1.5px] tabular-nums text-text-primary",
};

// Remove only conflicting defaults so caller utilities remain real overrides.
// Inline `style` is forwarded normally and has the final NativeWind precedence.
function textUtilityGroup(token: string): string | undefined {
  const utility = token.replace(/^!/, "");
  if (utility.includes(":")) return undefined;
  if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(utility)) return "weight";
  if (utility.startsWith("tracking-")) return "tracking";
  if (utility.startsWith("leading-")) return "leading";
  if (/^text-(xs|sm|base|lg|xl|[2-9]xl|display|h[1-3]|body(-lg|-sm)?|caption|button|stat(-sm|-lg)?)(\/.*)?$/.test(utility)) return "size";
  if (/^text-\[(?:length:)?[-.\d]/.test(utility)) return "size";
  if (/^text-(left|center|right|justify|start|end|ellipsis|clip|wrap|nowrap|balance|pretty)$/.test(utility)) return undefined;
  if (utility.startsWith("text-opacity-")) return undefined;
  if (utility.startsWith("text-")) return "color";
  return undefined;
}

export function Text({ variant = "body", className = "", style, ...props }: TextProps) {
  const overrides = new Set(className.split(/\s+/).map(textUtilityGroup).filter(Boolean));
  const defaults = variantClasses[variant]
    .split(" ")
    .filter((token) => !overrides.has(textUtilityGroup(token)))
    .join(" ");

  return <RNText {...props} className={`${defaults} ${className}`} style={style} />;
}
