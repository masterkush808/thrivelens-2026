import React from "react";
import { TextInput as RNTextInput, View, Pressable, TextInputProps as RNTextInputProps, ViewStyle, StyleProp } from "react-native";
import { Eye, EyeOff, Search } from "lucide-react-native";
import { colors } from "../../theme";
import { Text } from "./Text";

interface TextInputProps extends RNTextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextInput({
  label, error, leftIcon, rightIcon, containerStyle, style, className = "",
  onFocus, onBlur, editable, ...props
}: TextInputProps) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={containerStyle}>
      {label && <Text variant="bodySmall" className="text-text-secondary font-medium mb-2">{label}</Text>}
      <View
        className={`flex-row items-center bg-surface-elevated border rounded-xl px-4 min-h-[56px] ${editable === false ? "opacity-50" : ""}`}
        style={{ borderColor: error ? colors.error : focused ? colors.primary : colors.borderControl }}
      >
        {leftIcon && <View className="mr-3">{leftIcon}</View>}
        <RNTextInput
          {...props}
          editable={editable}
          accessibilityLabel={props.accessibilityLabel ?? label}
          className={`flex-1 text-text-primary text-base py-3 ${className}`}
          style={[{ minWidth: 0 }, style]}
          placeholderTextColor={props.placeholderTextColor ?? colors.textTertiary}
          selectionColor={props.selectionColor ?? colors.primary}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        />
        {rightIcon && <View className="ml-3">{rightIcon}</View>}
      </View>
      {error && <Text variant="caption" className="text-error mt-2" accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}

interface SearchInputProps extends Omit<TextInputProps, "leftIcon"> {
  onSearch?: () => void;
}

export function SearchInput({ onSearch, onSubmitEditing, ...props }: SearchInputProps) {
  return (
    <TextInput
      placeholder="Search..."
      returnKeyType="search"
      {...props}
      leftIcon={<Search size={20} color={colors.textTertiary} />}
      onSubmitEditing={(event) => { onSubmitEditing?.(event); onSearch?.(); }}
    />
  );
}

interface PasswordInputProps extends Omit<TextInputProps, "rightIcon"> {
  showToggle?: boolean;
}

export function PasswordInput({ showToggle = true, secureTextEntry = true, ...props }: PasswordInputProps) {
  const [override, setOverride] = React.useState<boolean | null>(null);
  const secure = override ?? secureTextEntry;

  return (
    <TextInput
      secureTextEntry={secure}
      {...props}
      rightIcon={showToggle ? (
        <Pressable
          onPress={() => setOverride((current) => (current === null ? !secureTextEntry : !current))}
          accessibilityRole="button"
          accessibilityLabel={secure ? "Show password" : "Hide password"}
          hitSlop={8}
          className="min-w-[44px] min-h-[44px] items-center justify-center rounded-lg active:bg-surface-highlight"
        >
          {secure ? <EyeOff size={21} color={colors.textSecondary} /> : <Eye size={21} color={colors.textSecondary} />}
        </Pressable>
      ) : undefined}
    />
  );
}
