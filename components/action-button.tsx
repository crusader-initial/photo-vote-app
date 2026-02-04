import { Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

interface ActionButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline";
  disabled?: boolean;
  loading?: boolean;
  size?: "small" | "medium" | "large";
}

export function ActionButton({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  size = "medium",
}: ActionButtonProps) {
  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const sizeStyles = {
    small: { paddingVertical: 8, paddingHorizontal: 16 },
    medium: { paddingVertical: 14, paddingHorizontal: 24 },
    large: { paddingVertical: 18, paddingHorizontal: 32 },
  };

  const textSizes = {
    small: 14,
    medium: 16,
    large: 18,
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        sizeStyles[size],
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "outline" ? "#6366F1" : "#ffffff"}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.text,
            styles[`${variant}Text`],
            { fontSize: textSizes[size] },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  primary: {
    backgroundColor: "#6366F1",
  },
  secondary: {
    backgroundColor: "#E5E7EB",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#6366F1",
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: "600",
  },
  primaryText: {
    color: "#ffffff",
  },
  secondaryText: {
    color: "#11181C",
  },
  outlineText: {
    color: "#6366F1",
  },
});
