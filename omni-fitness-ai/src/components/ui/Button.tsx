import React from "react";
import { Pressable, ActivityIndicator, ViewStyle, TextStyle, StyleProp, PressableProps } from "react-native";
import { colors, shadows } from "../../theme";
import { Text } from "./Text";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "accent";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, { container: string; text: string; foreground: string }> = {
  primary: { container: "bg-primary border border-primary-light active:bg-primary-dark", text: "text-text-inverse", foreground: colors.textInverse },
  secondary: { container: "bg-surface-elevated border border-border active:bg-surface-highlight", text: "text-text-primary", foreground: colors.textPrimary },
  ghost: { container: "bg-transparent border border-transparent active:bg-surface-highlight", text: "text-primary", foreground: colors.primary },
  destructive: { container: "bg-error border border-error active:opacity-80", text: "text-text-inverse", foreground: colors.textInverse },
  accent: { container: "bg-accent border border-accent active:bg-primary", text: "text-text-inverse", foreground: colors.textInverse },
};

const sizeStyles: Record<ButtonSize, { container: string; text: string }> = {
  sm: { container: "min-h-[44px] py-2 px-4 rounded-lg", text: "text-sm" },
  md: { container: "min-h-[52px] py-3 px-6 rounded-xl", text: "text-base" },
  lg: { container: "min-h-[58px] py-4 px-8 rounded-xl", text: "text-base" },
};

export function Button({
  variant = "primary", size = "md", title, loading = false,
  disabled = false, style, className = "", icon, accessibilityState, ...props
}: ButtonProps) {
  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];
  const unavailable = disabled || loading;
  const isGold = variant === "primary" || variant === "accent";
  const styledIcon = React.isValidElement<{ color?: string; style?: StyleProp<TextStyle> }>(icon) && icon.type !== React.Fragment
    ? React.cloneElement(icon, {
      color: isGold ? colors.textInverse : icon.props.color ?? variantStyle.foreground,
      style: isGold ? [icon.props.style, { color: colors.textInverse }] : icon.props.style,
    })
    : icon;

  return (
    <Pressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? "button"}
      accessibilityLabel={props.accessibilityLabel ?? title}
      accessibilityState={{ ...accessibilityState, disabled: unavailable, busy: loading }}
      className={`${variantStyle.container} ${sizeStyle.container} items-center justify-center flex-row gap-2 ${disabled ? "opacity-50" : ""} ${className}`}
      disabled={unavailable}
      style={[isGold && shadows.primaryGlow, style]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.foreground} size="small" />
      ) : (
        <>
          {styledIcon}
          <Text variant="button" className={`${variantStyle.text} ${sizeStyle.text} text-center`}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
