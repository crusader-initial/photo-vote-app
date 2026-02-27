import { View, Text, Pressable, StyleSheet, ScrollView, Platform, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getImageUrl } from "@/lib/utils";
import * as Haptics from "expo-haptics";
import { useState, useCallback } from "react";


export default function FavoritesScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();

  // Tracks cards whose favorite state has been locally toggled (true = favorited, false = unfavorited)
  const [localFavoriteOverrides, setLocalFavoriteOverrides] = useState<Record<number, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const utils = trpc.useUtils();
  const { data: favorites, isLoading } = trpc.favorites.getMyFavorites.useQuery(
    undefined,
    { enabled: !!user }
  );

  const toggleFavoriteMutation = trpc.favorites.toggle.useMutation({
    onError: (err, vars) => {
      // Revert local override on failure
      setLocalFavoriteOverrides((prev) => {
        const next = { ...prev };
        delete next[vars.cardId];
        return next;
      });
      if (Platform.OS === "web") {
        window.alert(err.message || "操作失败");
      }
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLocalFavoriteOverrides({});
    await utils.favorites.getMyFavorites.invalidate();
    setRefreshing(false);
  }, [utils.favorites.getMyFavorites]);

  const handleBack = () => {
    router.back();
  };

  const handleCardPress = (cardId: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/result?cardId=${cardId}&from=favorites`);
  };

  const handleToggleFavoriteLocal = (e: any, cardId: number) => {
    e?.stopPropagation?.();
    if (!user) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Determine current effective state: all cards on this screen start as favorited
    const currentlyFavorited = localFavoriteOverrides[cardId] !== undefined
      ? localFavoriteOverrides[cardId]
      : true;
    // Toggle local state immediately (no list refresh)
    setLocalFavoriteOverrides((prev) => ({ ...prev, [cardId]: !currentlyFavorited }));
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
            <IconSymbol name="arrow.left" size={18} color={colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.text }]}>我的收藏</Text>
              {favorites && favorites.length > 0 && (
                <View style={[styles.countBadge, { backgroundColor: colors.tint }]}>
                  <Text style={styles.countBadgeText}>{favorites.length}</Text>
                </View>
              )}
            </View>
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
              <IconSymbol name="person.fill" size={56} color={colors.border} />
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
              <View style={styles.emptyIconWrap}>
                <IconSymbol name="heart" size={40} color="#EF4444" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>还没有收藏</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>投票后可以收藏感兴趣的内容</Text>
            </View>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.tint}
                colors={[colors.tint]}
              />
            }
          >
            {favorites.map((favorite) => {
              if (!favorite) return null;
              const totalVotes = favorite.totalVotes;
              const isFavorited = localFavoriteOverrides[favorite.id] !== undefined
                ? localFavoriteOverrides[favorite.id]
                : true;

              return (
                <Pressable
                  key={favorite.id}
                  onPress={() => handleCardPress(favorite.id)}
                  style={({ pressed }) => [
                    styles.card,
                    styles.cardShadow,
                    { backgroundColor: colors.background },
                    pressed && styles.cardPressed,
                  ]}
                >
                  {/* Photos Grid */}
                  <View style={styles.photosGrid}>
                    {favorite.photos.slice(0, 4).map((photo, index) => (
                      <View
                        key={photo.id}
                        style={[
                          styles.photoItem,
                          favorite.photos.length === 1 && styles.photoItemSingle,
                          favorite.photos.length === 2 && styles.photoItemHalf,
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

                  {/* Card bottom bar */}
                  <View style={[styles.cardBar, { borderTopColor: colors.border }]}>
                    <View style={styles.cardBarStats}>
                      <IconSymbol name="person.2.fill" size={14} color={colors.muted} />
                      <Text style={[styles.cardBarText, { color: colors.muted }]}>{totalVotes} 票</Text>
                      <View style={[styles.dot, { backgroundColor: colors.border }]} />
                      <IconSymbol name="photo.fill" size={13} color={colors.muted} />
                      <Text style={[styles.cardBarText, { color: colors.muted }]}>{favorite.photos.length} 张</Text>
                    </View>

                    <Pressable
                      onPress={(e) => handleToggleFavoriteLocal(e, favorite.id)}
                      hitSlop={12}
                      style={({ pressed }) => [
                        styles.heartButton,
                        pressed && styles.heartButtonPressed,
                      ]}
                    >
                      <IconSymbol
                        name={isFavorited ? "heart.fill" : "heart"}
                        size={18}
                        color={isFavorited ? "#EF4444" : "#9CA3AF"}
                      />
                    </Pressable>
                  </View>
                </Pressable>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  placeholder: {
    width: 36,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyCard: {
    width: "100%",
    alignItems: "center",
    gap: 10,
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(239,68,68,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  loginButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 999,
  },
  loginButtonPressed: {
    opacity: 0.85,
  },
  loginButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  emptyText: {
    fontSize: 15,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  cardShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  photosGrid: {
    aspectRatio: 2,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  photoItem: {
    width: "50%",
    height: "50%",
    padding: 1,
  },
  photoItemSingle: {
    width: "100%",
    height: "100%",
  },
  photoItemHalf: {
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
  cardBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardBarStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardBarText: {
    fontSize: 13,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 2,
  },
  heartButton: {
    padding: 4,
  },
  heartButtonPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.9 }],
  },
});
