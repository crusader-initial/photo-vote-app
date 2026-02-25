import { useEffect } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const SKIP_VOTE_REDIRECT_KEY = "@skip_vote_redirect";

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const { loading: authLoading } = useAuth();

  // Auto redirect to vote page only on first load (not when coming from vote/waiting/result)
  useEffect(() => {
    if (authLoading) return;

    const checkAndRedirect = async () => {
      const skipRedirect = await AsyncStorage.getItem(SKIP_VOTE_REDIRECT_KEY);
      if (skipRedirect) {
        await AsyncStorage.removeItem(SKIP_VOTE_REDIRECT_KEY);
        return; // 从等待页/结果页返回，不跳转
      }
      if (!params.from) {
        router.replace("/vote");
      }
    };

    checkAndRedirect();
  }, [authLoading, params.from, router]);

  const handleUpload = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push("/create");
  };

  const handleVote = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push("/vote");
  };

  if (authLoading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center" style={styles.fill}>
        <ActivityIndicator size="large" color="#6366F1" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1 p-6" style={styles.fill}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>第一印象</Text>
          <Text style={styles.subtitle}>凭第一感觉，选出你最喜欢的那张</Text>
        </View>

        <View style={styles.cardsContainer}>
          <Pressable onPress={handleUpload} style={styles.pressable}>
            {({ pressed }) => (
              <View
                style={[
                  styles.card,
                  styles.uploadCard,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.cardIcon}>
                  <IconSymbol name="plus.circle.fill" size={40} color="#6366F1" />
                </View>
                <Text style={styles.cardTitle}>我要上传</Text>
                <Text style={styles.cardDescription}>
                  上传 2-4 张照片，看看大家会选哪张
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable onPress={handleVote} style={styles.pressable}>
            {({ pressed }) => (
              <View
                style={[
                  styles.card,
                  styles.voteCard,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.cardIcon}>
                  <IconSymbol name="hand.tap.fill" size={40} color="#ffffff" />
                </View>
                <Text style={[styles.cardTitle, styles.voteCardTitle]}>我要投票</Text>
                <Text style={[styles.cardDescription, styles.voteCardDescription]}>
                  帮助别人做决定
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    minHeight: 200,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    alignItems: "center",
    marginTop: 18,
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#11181C",
  },
  subtitle: {
    fontSize: 15,
    color: "#687076",
    marginTop: 6,
    textAlign: "center",
  },
  cardsContainer: {
    marginTop: 6,
    gap: 10,
    width: "80%",
    alignSelf: "center",
  },
  pressable: {
    width: "100%",
  },
  card: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: "center",
    width: "100%",
    minHeight: 168,
  },
  uploadCard: {
    backgroundColor: "#F5F5F5",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  voteCard: {
    backgroundColor: "#6366F1",
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  cardIcon: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#11181C",
    marginBottom: 6,
  },
  voteCardTitle: {
    color: "#ffffff",
  },
  cardDescription: {
    fontSize: 13,
    color: "#687076",
    textAlign: "center",
    lineHeight: 17,
  },
  voteCardDescription: {
    color: "rgba(255, 255, 255, 0.9)",
  },
});
