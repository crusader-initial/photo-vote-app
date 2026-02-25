import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getImageUrl } from "@/lib/utils";
import * as Haptics from "expo-haptics";

export default function FavoritesScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();

  const utils = trpc.useUtils();
  const { data: favorites, isLoading } = trpc.favorites.getMyFavorites.useQuery(
    undefined,
    { enabled: !!user }
  );

  const toggleFavoriteMutation = trpc.favorites.toggle.useMutation({
    onSuccess: () => {
      utils.favorites.getMyFavorites.invalidate();
    },
    onError: (err) => {
      if (Platform.OS === "web") {
        window.alert(err.message || "操作失败");
      }
    },
  });

  const handleBack = () => {
    router.back();
  };

  const handleCardPress = (cardId: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/result?cardId=${cardId}&from=favorites`);
  };

  const handleCancelFavorite = (e: any, cardId: number) => {
    e?.stopPropagation?.();
    if (!user || toggleFavoriteMutation.isPending) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    toggleFavoriteMutation.mutate({ cardId });
  };

  return (
    <ScreenContainer
      edges={["top", "left", "right", "bottom"]}
      className="flex-1"
      style={{ backgroundColor: colors.surface }}
    >
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={[styles.backButton, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <IconSymbol name="arrow.left" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>我的收藏</Text>
            <Text style={[styles.headerSubtitle, { color: colors.muted }]}>点击卡片查看投票结果与评论</Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>加载中...</Text>
            </View>
          </View>
        ) : !user ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <IconSymbol name="person.fill" size={64} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>请先登录</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>登录后可查看与管理收藏</Text>
              <Pressable
                onPress={() => router.push("/login")}
                style={({ pressed }) => [
                  styles.loginButton,
                  { backgroundColor: colors.tint },
                  pressed && styles.loginButtonPressed,
                ]}
              >
                <Text style={styles.loginButtonText}>去登录</Text>
              </Pressable>
            </View>
          </View>
        ) : !favorites || favorites.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <IconSymbol name="heart" size={64} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>还没有收藏</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>投票后可以收藏感兴趣的内容</Text>
            </View>
          </View>
        ) : (
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {favorites.map((favorite) => {
              if (!favorite) return null;
              
              const totalVotes = favorite.totalVotes;
              const isCompleted = favorite.isCompleted;
              
              return (
                <View
                  key={favorite.id}
                  style={[
                    styles.card,
                    styles.cardShadow,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <Pressable
                    onPress={() => handleCardPress(favorite.id)}
                    style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
                  >
                    {/* Photos Grid */}
                    <View style={styles.photosGrid}>
                      {favorite.photos.slice(0, 4).map((photo, index) => (
                        <View 
                          key={photo.id} 
                          style={[
                            styles.photoItem,
                            favorite.photos.length === 2 && styles.photoItemLarge,
                            favorite.photos.length === 3 && index === 2 && styles.photoItemFull,
                          ]}
                        >
                          <Image
                            source={{ uri: getImageUrl(photo.url) }}
                            style={styles.photoImage}
                            contentFit="cover"
                          />
                        </View>
                      ))}
                    </View>

                    {/* Card Info */}
                    <View style={styles.cardInfo}>
                      <View style={styles.cardStats}>
                        <View style={styles.statItem}>
                          <IconSymbol name="person.2.fill" size={16} color={colors.muted} />
                          <Text style={[styles.statText, { color: colors.muted }]}>{totalVotes} 票</Text>
                        </View>
                        <View style={styles.statItem}>
                          <IconSymbol name="photo.fill" size={16} color={colors.muted} />
                          <Text style={[styles.statText, { color: colors.muted }]}>{favorite.photos.length} 张</Text>
                        </View>
                      </View>
                      
                      <View style={[
                        styles.statusBadge,
                        isCompleted ? styles.statusBadgeCompleted : styles.statusBadgePending
                      ]}>
                        <Text style={[
                          styles.statusText,
                          isCompleted ? styles.statusTextCompleted : styles.statusTextPending
                        ]}>
                          {isCompleted ? "已完成" : `${totalVotes}/10`}
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  {/* 取消收藏 */}
                  <Pressable
                    onPress={(e) => handleCancelFavorite(e, favorite.id)}
                    disabled={toggleFavoriteMutation.isPending}
                    style={({ pressed }) => [
                      styles.cancelFavoriteBtn,
                      { borderTopColor: colors.border },
                      pressed && styles.cancelFavoriteBtnPressed,
                    ]}
                  >
                    <IconSymbol name="heart.fill" size={18} color="#EF4444" />
                    <Text style={styles.cancelFavoriteText}>取消收藏</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyCard: {
    width: "100%",
    alignItems: "center",
    gap: 12,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  loginButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  loginButtonPressed: {
    opacity: 0.9,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  emptyText: {
    fontSize: 16,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 16,
  },
  cardPressable: {
    flex: 1,
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  cancelFavoriteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  cancelFavoriteBtnPressed: {
    opacity: 0.7,
    backgroundColor: "#FEF2F2",
  },
  cancelFavoriteText: {
    fontSize: 14,
    color: "#EF4444",
    fontWeight: "500",
  },
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    aspectRatio: 1,
  },
  photoItem: {
    width: "50%",
    height: "50%",
    padding: 1,
  },
  photoItemLarge: {
    width: "50%",
    height: "100%",
  },
  photoItemFull: {
    width: "100%",
    height: "50%",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  cardInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  cardStats: {
    flexDirection: "row",
    gap: 16,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeCompleted: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  statusBadgePending: {
    backgroundColor: "rgba(99, 102, 241, 0.1)",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusTextCompleted: {
    color: "#22C55E",
  },
  statusTextPending: {
    color: "#6366F1",
  },
  cardShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
