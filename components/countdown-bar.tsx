import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolateColor,
} from "react-native-reanimated";
import { useEffect } from "react";
import { useSharedValue } from "react-native-reanimated";

interface CountdownBarProps {
  duration: number; // in seconds
  onComplete: () => void;
  isRunning: boolean;
}

export function CountdownBar({ duration, onComplete, isRunning }: CountdownBarProps) {
  const progress = useSharedValue(1);
  const timeLeft = useSharedValue(duration);

  useEffect(() => {
    if (isRunning) {
      progress.value = 1;
      timeLeft.value = duration;
      
      progress.value = withTiming(0, {
        duration: duration * 1000,
        easing: Easing.linear,
      });

      // Update time left every second
      const interval = setInterval(() => {
        timeLeft.value = Math.max(0, timeLeft.value - 1);
      }, 1000);

      // Call onComplete when done
      const timeout = setTimeout(() => {
        onComplete();
      }, duration * 1000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [isRunning, duration]);

  const animatedBarStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 0.3, 0.6, 1],
      ["#EF4444", "#F59E0B", "#22C55E", "#22C55E"]
    );

    return {
      width: `${progress.value * 100}%`,
      backgroundColor,
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      progress.value,
      [0, 0.3, 0.6, 1],
      ["#EF4444", "#F59E0B", "#22C55E", "#22C55E"]
    );

    return { color };
  });

  return (
    <View style={styles.container}>
      <View style={styles.barContainer}>
        <Animated.View style={[styles.bar, animatedBarStyle]} />
      </View>
      <Animated.Text style={[styles.timeText, animatedTextStyle]}>
        {Math.ceil(timeLeft.value)}s
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  barContainer: {
    flex: 1,
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 4,
  },
  timeText: {
    fontSize: 18,
    fontWeight: "bold",
    width: 40,
    textAlign: "right",
  },
});
