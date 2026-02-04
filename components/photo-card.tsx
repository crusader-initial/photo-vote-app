import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { cn } from "@/lib/utils";

interface PhotoCardProps {
  uri: string;
  selected?: boolean;
  showStats?: boolean;
  percentage?: number;
  voteCount?: number;
  onPress?: () => void;
  disabled?: boolean;
  size?: "small" | "medium" | "large";
}

export function PhotoCard({
  uri,
  selected = false,
  showStats = false,
  percentage = 0,
  voteCount = 0,
  onPress,
  disabled = false,
  size = "medium",
}: PhotoCardProps) {
  const sizeStyles = {
    small: { width: 100, height: 100 },
    medium: { width: 150, height: 150 },
    large: { width: 180, height: 180 },
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        sizeStyles[size],
        selected && styles.selected,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="cover"
        transition={200}
      />
      
      {selected && (
        <View style={styles.selectedOverlay}>
          <View style={styles.checkmark}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        </View>
      )}
      
      {showStats && (
        <View style={styles.statsOverlay}>
          <Text style={styles.percentageText}>{percentage}%</Text>
          <Text style={styles.voteCountText}>{voteCount} 票</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
    borderWidth: 3,
    borderColor: "transparent",
  },
  selected: {
    borderColor: "#6366F1",
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.6,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkText: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
  },
  statsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  percentageText: {
    color: "white",
    fontSize: 28,
    fontWeight: "bold",
  },
  voteCountText: {
    color: "white",
    fontSize: 14,
    marginTop: 4,
  },
});
