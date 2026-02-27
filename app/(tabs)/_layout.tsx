import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform, Pressable, View, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";

function UploadTabButton() {
  const router = useRouter();

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push("/create");
  };

  return (
    <Pressable onPress={handlePress} style={styles.uploadButton}>
      <View style={styles.uploadButtonInner}>
        <IconSymbol name="plus" size={22} color="#ffffff" />
      </View>
    </Pressable>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 60 + bottomPadding;

  const darkTabBar = {
    position: "absolute" as const,
    paddingTop: 8,
    paddingBottom: bottomPadding,
    height: tabBarHeight,
    backgroundColor: "rgba(22, 20, 40, 0.75)",
    borderTopColor: "rgba(255,255,255,0.06)",
    borderTopWidth: 0.5,
    elevation: 0,
  };

  const lightTabBar = {
    position: "absolute" as const,
    paddingTop: 8,
    paddingBottom: bottomPadding,
    height: tabBarHeight,
    backgroundColor: "rgba(250, 250, 252, 0.92)",
    borderTopColor: "rgba(0,0,0,0.07)",
    borderTopWidth: 0.5,
    elevation: 0,
  };

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: route.name === "me" ? lightTabBar : darkTabBar,
        tabBarActiveTintColor: "#6366F1",
        tabBarInactiveTintColor:
          route.name === "me" ? "rgba(100,100,120,0.5)" : "rgba(255,255,255,0.45)",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
        sceneContainerStyle: { flex: 1 },
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "首页",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: "上传",
          tabBarButton: () => <UploadTabButton />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "我的",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  uploadButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
    marginBottom: 4,
  },
});
