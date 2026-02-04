import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, { useAnimatedProps, withTiming } from "react-native-reanimated";
import { useEffect } from "react";
import { useSharedValue } from "react-native-reanimated";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  current: number;
  total: number;
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({
  current,
  total,
  size = 200,
  strokeWidth = 12,
}: ProgressRingProps) {
  const progress = useSharedValue(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  useEffect(() => {
    progress.value = withTiming(current / total, { duration: 500 });
  }, [current, total]);

  const animatedProps = useAnimatedProps(() => {
    return {
      strokeDashoffset: circumference * (1 - progress.value),
    };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#6366F1"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.textContainer}>
        <Text style={styles.currentText}>{current}</Text>
        <Text style={styles.totalText}>/ {total}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  svg: {
    position: "absolute",
  },
  textContainer: {
    alignItems: "center",
  },
  currentText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#11181C",
  },
  totalText: {
    fontSize: 18,
    color: "#687076",
  },
});
