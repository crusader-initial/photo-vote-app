import { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";

const SKIP_VOTE_REDIRECT_KEY = "@skip_vote_redirect";
import { ProgressRing } from "@/components/progress-ring";
import { ActionButton } from "@/components/action-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";

export default function WaitingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cardId: string }>();
  const cardId = params.cardId ? parseInt(params.cardId) : 0;

  const { data: card, refetch } = trpc.cards.getById.useQuery(
    { cardId },
    { 
      enabled: cardId > 0,
      refetchInterval: 5000, // Poll every 5 seconds
    }
  );

  useEffect(() => {
    if (card?.isCompleted) {
      router.replace(`/result?cardId=${cardId}`);
    }
  }, [card?.isCompleted, cardId]);

  const goToHome = () => {
    AsyncStorage.setItem(SKIP_VOTE_REDIRECT_KEY, "1").catch(console.error);
    router.replace("/");
  };

  const handleBack = () => {
    goToHome();
  };

  const handleViewResult = () => {
    router.replace(`/result?cardId=${cardId}`);
  };

  const handleViewHistory = () => {
    goToHome();
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} className="flex-1">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <IconSymbol name="arrow.left" size={24} color="#11181C" />
          </Pressable>
          <Text style={styles.title}>等待投票</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Progress */}
        <View style={styles.progressContainer}>
          <ProgressRing
            current={card?.totalVotes ?? 0}
            total={10}
            size={220}
            strokeWidth={16}
          />
          <Text style={styles.progressText}>票</Text>
        </View>

        {/* Status */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>
            {card?.isCompleted ? "投票完成！" : "正在收集投票..."}
          </Text>
          <Text style={styles.statusSubtitle}>
            {card?.isCompleted
              ? "点击下方按钮查看结果"
              : "收集满10票后自动显示结果"}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {card?.isCompleted ? (
            <>
              <ActionButton
                title="查看结果"
                onPress={handleViewResult}
                size="large"
              />
              <ActionButton
                title="查看我的上传"
                onPress={handleViewHistory}
                variant="outline"
                size="large"
              />
            </>
          ) : (
            <ActionButton
              title="返回首页"
              onPress={handleBack}
              variant="outline"
              size="large"
            />
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 40,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#11181C",
  },
  placeholder: {
    width: 40,
  },
  progressContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  progressText: {
    fontSize: 16,
    color: "#687076",
    marginTop: 16,
  },
  statusContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#11181C",
    marginBottom: 8,
  },
  statusSubtitle: {
    fontSize: 14,
    color: "#687076",
    textAlign: "center",
  },
  actionsContainer: {
    alignItems: "center",
    gap: 12,
  },
});
