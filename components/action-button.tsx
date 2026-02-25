import { Text, Pressable, StyleSheet, ActivityIndicator, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

interface ActionButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline";
  disabled?: boolean;
  loading?: boolean;
  size?: "small" | "medium" | "large";
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ActionButton({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  size = "medium",
  fullWidth = false,
  style,
}: ActionButtonProps) {
  const variantStyle =
    variant === "secondary"
      ? styles.secondary
      : variant === "outline"
        ? styles.outline
        : styles.primary;
  const variantTextStyle =
    variant === "secondary"
      ? styles.secondaryText
      : variant === "outline"
        ? styles.outlineText
        : styles.primaryText;

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
    <Pressable onPress={handlePress} disabled={disabled || loading}>
      {({ pressed }) => (
        <View
          style={[
            styles.button,
            variantStyle,
            fullWidth && styles.fullWidth,
            sizeStyles[size],
            (disabled || loading) && styles.disabled,
            pressed && styles.pressed,
            style,
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
                variantTextStyle,
                { fontSize: textSizes[size] },
              ]}
            >
              {title}
            </Text>
          )}
        </View>
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
    overflow: "hidden",
  },
  fullWidth: {
    alignSelf: "stretch",
    width: "100%",
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
