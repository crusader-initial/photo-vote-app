import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { HistoryDrawer } from "@/components/history-drawer";
import { useDeviceId } from "@/hooks/use-device-id";
import { trpc } from "@/lib/trpc";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const SKIP_VOTE_REDIRECT_KEY = "@skip_vote_redirect";

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const { deviceId, loading: deviceLoading } = useDeviceId();
  const [showHistory, setShowHistory] = useState(false);
  
  const { data: voteStats } = trpc.votes.getDailyCount.useQuery(
    { deviceId: deviceId ?? "" },
    { enabled: !!deviceId }
  );

  const { data: myCards } = trpc.cards.getMyCards.useQuery(
    { deviceId: deviceId ?? "" },
    { enabled: !!deviceId }
  );

  const pendingCards = myCards?.filter(c => !c.isCompleted).length ?? 0;

  // Auto redirect to vote page only on first load (not when coming from vote/waiting/result)
  useEffect(() => {
    if (deviceLoading) return;

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
  }, [deviceLoading, params.from, router]);

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

  const handleShowHistory = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowHistory(true);
  };

  const handleShowFavorites = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push("/favorites");
  };

  if (deviceLoading) {
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

        {/* 我的上传 */}
        {myCards && myCards.length > 0 && (
          <Pressable
            onPress={handleShowHistory}
            style={({ pressed }) => [
              styles.rowButton,
              pressed && styles.rowButtonPressed,
            ]}
          >
            <View style={[styles.rowIconWrap, styles.rowIconUpload]}>
              <IconSymbol name="clock.fill" size={16} color="#ffffff" />
            </View>
            <Text style={styles.rowButtonText}>我的上传</Text>
            {pendingCards > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCards}</Text>
              </View>
            )}
            <IconSymbol name="chevron.right" size={16} color="#9CA3AF" />
          </Pressable>
        )}

        {/* 我的收藏 */}
        <Pressable
          onPress={handleShowFavorites}
          style={({ pressed }) => [
            styles.rowButton,
            pressed && styles.rowButtonPressed,
          ]}
        >
          <View style={[styles.rowIconWrap, styles.rowIconFav]}>
            <IconSymbol name="heart.fill" size={16} color="#ffffff" />
          </View>
          <Text style={styles.rowButtonText}>我的收藏</Text>
          <IconSymbol name="chevron.right" size={16} color="#9CA3AF" />
        </Pressable>

        {/* 两个大块：缩小尺寸 */}
        <View style={styles.cardsContainer}>
          <Pressable
            onPress={handleUpload}
            style={({ pressed }) => [
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
          </Pressable>

          <Pressable
            onPress={handleVote}
            style={({ pressed }) => [
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
              5秒内选出你喜欢的，帮助别人做决定
            </Text>
            <Text style={styles.voteCardStats}>
              今日剩余：{voteStats?.remaining ?? 20}/20
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* History Drawer */}
      <HistoryDrawer
        visible={showHistory}
        onClose={() => setShowHistory(false)}
      />
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
    paddingBottom: 24,
  },
  header: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 16,
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
  rowButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
  },
  rowButtonPressed: {
    opacity: 0.8,
  },
  rowIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  rowIconUpload: {
    backgroundColor: "#6366F1",
  },
  rowIconFav: {
    backgroundColor: "#EF4444",
  },
  rowButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#11181C",
  },
  badge: {
    backgroundColor: "#6366F1",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  cardsContainer: {
    marginTop: 8,
    gap: 14,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    alignItems: "center",
  },
  uploadCard: {
    backgroundColor: "#F5F5F5",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  voteCard: {
    backgroundColor: "#6366F1",
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  cardIcon: {
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#11181C",
    marginBottom: 4,
  },
  voteCardTitle: {
    color: "#ffffff",
  },
  cardDescription: {
    fontSize: 13,
    color: "#687076",
    textAlign: "center",
    lineHeight: 18,
  },
  voteCardDescription: {
    color: "rgba(255, 255, 255, 0.9)",
  },
  voteCardStats: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.75)",
    marginTop: 6,
  },
});
