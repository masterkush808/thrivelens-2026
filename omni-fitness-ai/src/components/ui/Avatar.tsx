import React from "react";
import { View, Image, ViewStyle, StyleProp } from "react-native";
import { Text } from "./Text";

interface AvatarProps {
  uri?: string;
  initials?: string;
  size?: "sm" | "md" | "lg" | "xl";
  style?: StyleProp<ViewStyle>;
}

const sizeMap = { sm: "w-8 h-8", md: "w-12 h-12", lg: "w-16 h-16", xl: "w-24 h-24" };
const textSizeMap = { sm: "text-xs", md: "text-sm", lg: "text-lg", xl: "text-2xl" };

export function Avatar({ uri, initials = "?", size = "md", style }: AvatarProps) {
  return (
    <View
      className={`${sizeMap[size]} rounded-full bg-primary border border-primary-light items-center justify-center overflow-hidden`}
      style={style}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <Text variant="button" className={`${textSizeMap[size]} text-text-inverse font-semibold`}>{initials}</Text>
      )}
    </View>
  );
}
