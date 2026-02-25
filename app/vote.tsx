import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView, ScrollView as RNScrollView, Modal, Image as RNImage, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { getImageUrl } from "@/lib/utils";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_HEIGHT * 0.08; // 8% 屏高，轻滑即可切换
const SKIP_VOTE_REDIRECT_KEY = "@skip_vote_redirect";
const PREFETCH_COUNT = 3; // 预加载卡片数量
const RECENT_IDS_MAX = 20; // 排除最近展示的卡片 ID 数量，避免马上又出现

interface VoteCardData {
  id: number;
  photos: { id: number; url: string; photoIndex: number; voteCount: number }[];
  totalVotes: number;
}

export default function VoteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  
  // Current card state
  const [currentCard, setCurrentCard] = useState<VoteCardData | null>(null);
  const [cardQueue, setCardQueue] = useState<VoteCardData[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const recentCardIdsRef = useRef<number[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [voteResult, setVoteResult] = useState<{ percentage: number; voteCount: number; totalVotes: number } | null>(null);
  const [allPhotoStats, setAllPhotoStats] = useState<{ id: number; percentage: number; voteCount: number }[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Comment state
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(false);
  
  // Favorite state
  const [isFavorited, setIsFavorited] = useState(false);

  // Navigation history
  const [previousCards, setPreviousCards] = useState<VoteCardData[]>([]);
  
  // Animation values
  const translateY = useSharedValue(0);
  const cardOpacity = useSharedValue(1);

  const utils = trpc.useUtils();

  // 拉取一批卡片（用于初始加载与队列补货）
  const fetchBatch = useCallback(async (excludeCardIds: number[]): Promise<VoteCardData[]> => {
    if (!user) return [];
    const batch = await utils.cards.getRandomForVotingBatch.fetch({
      count: PREFETCH_COUNT,
      excludeCardIds: excludeCardIds.length > 0 ? excludeCardIds : undefined,
    });
    return batch as VoteCardData[];
  }, [user, utils.cards.getRandomForVotingBatch]);

  // 初始加载或队列被清空时：拉取一批卡片
  useEffect(() => {
    if (!user || cardQueue.length > 0 || isTransitioning) return;
    setQueueLoading(true);
    const exclude = recentCardIdsRef.current;
    fetchBatch(exclude)
      .then((batch) => {
        setCardQueue(batch);
        setCurrentCard(batch[0] ?? null);
      })
      .catch((e) => {
        console.error("Batch fetch failed:", e);
      })
      .finally(() => {
        setQueueLoading(false);
      });
  }, [user, cardQueue.length, isTransitioning, fetchBatch]);

  const submitVoteMutation = trpc.votes.submit.useMutation({
    onSuccess: (data) => {
      if (currentCard) {
        const totalVotes = data.totalVotes;
        const stats = currentCard.photos.map(photo => {
          const isSelected = photo.id === selectedPhotoId;
          const voteCount = isSelected ? data.voteCount : photo.voteCount;
          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          return { id: photo.id, percentage, voteCount };
        });
        setAllPhotoStats(stats);
      }
      setVoteResult({ percentage: data.percentage, voteCount: data.voteCount, totalVotes: data.totalVotes });
      setShowResult(true);
      setShowComments(false); // Reset comments view
    },
    onError: (error) => {
      console.error("Vote error:", error);
      goToNextCard();
    },
  });

  // Comments queries
  const { data: commentsData, refetch: refetchComments } = trpc.comments.getByCardId.useQuery(
    { cardId: currentCard?.id ?? 0 },
    { enabled: !!currentCard && !!user && showResult }
  );

  // Favorite queries
  const { data: favoriteData, refetch: refetchFavorite } = trpc.favorites.check.useQuery(
    { cardId: currentCard?.id ?? 0 },
    { enabled: !!currentCard && !!user && showResult }
  );

  const toggleFavoriteMutation = trpc.favorites.toggle.useMutation({
    onSuccess: (data) => {
      setIsFavorited(data.isFavorited);
    },
    onError: (error) => {
      console.error("Favorite error:", error);
    },
  });

  // Update favorite state when data changes
  useEffect(() => {
    if (favoriteData) {
      setIsFavorited(favoriteData.isFavorited);
    }
  }, [favoriteData]);

  const createCommentMutation = trpc.comments.create.useMutation({
    onSuccess: () => {
      setCommentText("");
      refetchComments();
    },
    onError: (error) => {
      console.error("Comment error:", error);
    },
  });

  const handleSubmitComment = useCallback(() => {
    if (!commentText.trim() || !currentCard) return;
    if (!user) {
      if (Platform.OS === "web") window.alert("请先登录后评论");
      else Alert.alert("提示", "请先登录后评论", [{ text: "去登录", onPress: () => router.push("/login") }, { text: "取消" }]);
      return;
    }
    createCommentMutation.mutate({
      cardId: currentCard.id,
      content: commentText.trim(),
    });
  }, [commentText, currentCard, createCommentMutation, user, router]);

  const handleToggleFavorite = useCallback(() => {
    if (!currentCard) return;
    if (!user) {
      if (Platform.OS === "web") window.alert("请先登录后收藏");
      else Alert.alert("提示", "请先登录后收藏", [{ text: "去登录", onPress: () => router.push("/login") }, { text: "取消" }]);
      return;
    }
    toggleFavoriteMutation.mutate({ cardId: currentCard.id });
  }, [currentCard, toggleFavoriteMutation, user, router]);

  // 预加载当前卡片及队列中所有卡片的图片
  useEffect(() => {
    if (Platform.OS === "web") return;
    const toPreload = currentCard ? [currentCard, ...cardQueue] : cardQueue;
    toPreload.forEach((c) => {
      c.photos.forEach((photo) => {
        RNImage.prefetch(getImageUrl(photo.url)).catch(() => {});
      });
    });
  }, [currentCard, cardQueue]);

  const resetAndFetchNext = useCallback(() => {
    setShowResult(false);
    setVoteResult(null);
    setSelectedPhotoId(null);
    setAllPhotoStats([]);
    setShowComments(false);
    setCommentText("");
    setIsFavorited(false);
    translateY.value = 0;
    cardOpacity.value = 1;
    const prevId = currentCard?.id;
    if (currentCard) {
      setPreviousCards((prev) => [...prev, currentCard]);
    }
    if (prevId != null) {
      recentCardIdsRef.current = [
        prevId,
        ...recentCardIdsRef.current.slice(0, RECENT_IDS_MAX - 1),
      ];
    }

    if (cardQueue.length > 1) {
      const next = cardQueue[1];
      setCardQueue((prev) => prev.slice(1));
      setCurrentCard(next);
      const exclude = [
        ...recentCardIdsRef.current,
        ...cardQueue.slice(1).map((c) => c.id),
      ];
      fetchBatch(exclude).then((append) => {
        setCardQueue((prev) => [...prev, ...append]);
      });
    } else {
      setCurrentCard(null);
      setCardQueue([]);
      setQueueLoading(true);
    }

    setTimeout(() => {
      setIsTransitioning(false);
    }, 50);
  }, [currentCard, cardQueue, fetchBatch, setPreviousCards]);

  const resetAndShowPrevious = useCallback(() => {
    setShowResult(false);
    setVoteResult(null);
    setSelectedPhotoId(null);
    setAllPhotoStats([]);
    setShowComments(false);
    setCommentText("");
    setIsFavorited(false);
    translateY.value = 0;
    cardOpacity.value = 1;

    setPreviousCards((prev) => {
      if (prev.length === 0) return prev;
      const newPrev = [...prev];
      const previousCard = newPrev.pop()!;
      setCardQueue((queue) => (currentCard ? [currentCard, ...queue] : queue));
      setCurrentCard(previousCard);
      return newPrev;
    });

    setTimeout(() => {
      setIsTransitioning(false);
    }, 50);
  }, [currentCard]);

  const goToNextCard = useCallback(() => {
    setIsTransitioning(true);
    cardOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(resetAndFetchNext)();
    });
  }, [resetAndFetchNext]);

  const goToPreviousCard = useCallback(() => {
    if (previousCards.length === 0 || isTransitioning) return;
    setIsTransitioning(true);
    cardOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(resetAndShowPrevious)();
    });
  }, [previousCards.length, isTransitioning, resetAndShowPrevious]);

  const handleSelectPhoto = useCallback((photoId: number) => {
    if (selectedPhotoId !== null || !currentCard) return;
    if (!user) {
      if (Platform.OS === "web") window.alert("请先登录后再投票");
      else Alert.alert("提示", "请先登录后再投票", [{ text: "去登录", onPress: () => router.push("/login") }, { text: "取消" }]);
      return;
    }

    setSelectedPhotoId(photoId);

    submitVoteMutation.mutate({
      cardId: currentCard.id,
      photoId,
    });
  }, [selectedPhotoId, currentCard, submitVoteMutation, user, router]);

  const handleTakeBreak = useCallback(() => {
    AsyncStorage.setItem(SKIP_VOTE_REDIRECT_KEY, "1").catch(console.error);
    router.replace("/");
  }, [router]);

  // Swipe gesture - 上滑上一张，下滑下一张
  const swipeGesture = useMemo(() => 
    Gesture.Pan()
      .enabled(true)
      .onUpdate((event) => {
        translateY.value = event.translationY;
      })
      .onEnd((event) => {
        if (event.translationY <= -SWIPE_THRESHOLD) {
          // 上滑：查看上一张
          translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 200 }, () => {
            runOnJS(goToPreviousCard)();
          });
        } else if (event.translationY >= SWIPE_THRESHOLD) {
          // 下滑：查看下一张
          if (showResult && showComments) {
            // 评论区打开时先保持当前卡片
            translateY.value = withSpring(0, { damping: 15 });
            return;
          }
          translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 }, () => {
            runOnJS(goToNextCard)();
          });
        } else {
          translateY.value = withSpring(0, { damping: 15 });
        }
      })
      .runOnJS(true),
    [showResult, showComments, goToNextCard, goToPreviousCard]
  );

  // Animated styles
  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: cardOpacity.value,
  }));

  // Loading state
  if (authLoading) {
    return (
      <View style={[styles.fullScreen, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  // No cards available
  if (!currentCard && !queueLoading && !isTransitioning) {
    return (
      <View style={[styles.fullScreen, { paddingTop: insets.top }]}>
        <Pressable onPress={handleTakeBreak} style={styles.restButton}>
          <IconSymbol name="xmark" size={24} color="#ffffff" />
        </Pressable>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>暂无可投票的卡片</Text>
          <Text style={styles.emptySubtitle}>等待更多用户上传照片</Text>
          <Pressable onPress={handleTakeBreak} style={styles.backHomeButton}>
            <Text style={styles.backHomeText}>返回首页</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Loading next card - keep previous UI visible during transition
  if (!currentCard && (queueLoading || isTransitioning)) {
    return (
      <View style={[styles.fullScreen, { paddingTop: insets.top }]}>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>正在加载...</Text>
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.fullScreen, animatedCardStyle]}>
          {/* Background gradient */}
          <View style={styles.backgroundGradient} />
          
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            {/* Home Button (left side) */}
            <Pressable onPress={handleTakeBreak} style={styles.restButton}>
              <IconSymbol name="house.fill" size={24} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>

          {/* Main content */}
          <View style={styles.content}>
            {!showResult ? (
              // Voting mode
              <>
                <Text style={styles.title}>选择你喜欢的</Text>
                {!user && (
                  <Pressable onPress={() => router.push("/login")} style={styles.loginHint}>
                    <Text style={styles.loginHintText}>登录后可投票、评论、收藏</Text>
                  </Pressable>
                )}
                <View style={styles.photosGrid}>
                  {currentCard!.photos.map((photo, index) => (
                    <Pressable
                      key={photo.id}
                      onPress={() => handleSelectPhoto(photo.id)}
                      disabled={selectedPhotoId !== null}
                      style={({ pressed }) => [
                        styles.photoCard,
                        currentCard!.photos.length === 2 && styles.photoCardLarge,
                        currentCard!.photos.length === 3 && index === 2 && styles.photoCardFull,
                        pressed && styles.photoCardPressed,
                      ]}
                    >
                      <Image
                        source={{ uri: getImageUrl(photo.url) }}
                        style={styles.photoImage}
                        contentFit="cover"
                      />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              // Result mode
              <>
                <Text style={styles.title}>投票结果</Text>
                {showComments ? (
                  <Text style={styles.subtitle}>点击关闭评论区</Text>
                ) : null}
                
                <View style={styles.resultsList}>
                  {currentCard!.photos.map((photo) => {
                    const stats = allPhotoStats.find(s => s.id === photo.id);
                    const isSelected = photo.id === selectedPhotoId;
                    const percentage = stats?.percentage ?? 0;
                    const voteCount = stats?.voteCount ?? photo.voteCount;

                    return (
                      <View key={photo.id} style={[
                        styles.resultItem,
                        isSelected && styles.resultItemSelected
                      ]}>
                        <Image
                          source={{ uri: getImageUrl(photo.url) }}
                          style={styles.resultPhoto}
                          contentFit="cover"
                        />
                        <View style={styles.resultStats}>
                          <View style={styles.resultHeader}>
                            <Text style={styles.resultPercentage}>{percentage}%</Text>
                            <Text style={styles.uploadOrderText}>上传第 {photo.photoIndex + 1} 张</Text>
                            {isSelected && (
                              <View style={styles.yourChoiceBadge}>
                                <Text style={styles.yourChoiceText}>你的选择</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.resultVotes}>{voteCount} 票</Text>
                          <View style={styles.resultBar}>
                            <View style={[
                              styles.resultBarFill,
                              { width: `${percentage}%` },
                              isSelected && styles.resultBarFillSelected
                            ]} />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>

                <Text style={styles.totalVotes}>
                  共 {voteResult?.totalVotes ?? 0} 人参与投票
                </Text>

                {/* Action Buttons Row */}
                <View style={styles.actionButtonsRow}>
                  {/* Favorite Button */}
                  <Pressable
                    onPress={handleToggleFavorite}
                    disabled={toggleFavoriteMutation.isPending}
                    style={[
                      styles.actionButton,
                      isFavorited && styles.actionButtonActive
                    ]}
                  >
                    <IconSymbol 
                      name={isFavorited ? "heart.fill" : "heart"} 
                      size={20} 
                      color={isFavorited ? "#EF4444" : "#6366F1"} 
                    />
                    <Text style={[
                      styles.actionButtonText,
                      isFavorited && styles.actionButtonTextActive
                    ]}>
                      {isFavorited ? "已收藏" : "收藏"}
                    </Text>
                  </Pressable>

                  {/* Comments Toggle Button */}
                  <Pressable
                    onPress={() => setShowComments(!showComments)}
                    style={[
                      styles.actionButton,
                      showComments && styles.actionButtonActive
                    ]}
                  >
                    <IconSymbol 
                      name="bubble.left.fill" 
                      size={20} 
                      color="#6366F1" 
                    />
                    <Text style={styles.actionButtonText}>
                      {showComments ? "收起" : "查看"}评论 
                      {commentsData?.comments.length ? ` (${commentsData.comments.length})` : ''}
                    </Text>
                  </Pressable>
                </View>

                {/* Swipe hint removed */}
              </>
            )}
          </View>
        </Animated.View>
      </GestureDetector>
      
      {/* 评论区抽屉 - 从底部弹出，关闭后才能上滑下一张 */}
      <Modal
        visible={showComments && !!(commentsData?.canView)}
        transparent
        animationType="slide"
        onRequestClose={() => setShowComments(false)}
      >
        <Pressable style={styles.drawerOverlay} onPress={() => setShowComments(false)}>
          <Pressable
            style={[styles.commentsDrawer, { paddingBottom: insets.bottom + 16 }]}
            onPress={() => {}}
          >
            <Pressable style={styles.drawerHandleWrap} onPress={() => {}}>
              <View style={styles.drawerHandle} />
            </Pressable>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>评论区</Text>
              <Pressable onPress={() => setShowComments(false)} style={styles.drawerCloseBtn} hitSlop={12}>
                <IconSymbol name="xmark.circle.fill" size={28} color="#9CA3AF" />
              </Pressable>
            </View>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.drawerBody}
            >
              <View style={styles.drawerInputRow}>
                <TextInput
                  style={styles.drawerInput}
                  placeholder={user ? "写下你的想法..." : "请先登录后评论"}
                  placeholderTextColor="#9CA3AF"
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                  editable={!!user}
                />
                <Pressable
                  onPress={handleSubmitComment}
                  disabled={!user || !commentText.trim() || createCommentMutation.isPending}
                  style={[
                    styles.drawerSendBtn,
                    (!user || !commentText.trim() || createCommentMutation.isPending) && styles.drawerSendBtnDisabled,
                  ]}
                >
                  <IconSymbol
                    name="paperplane.fill"
                    size={20}
                    color={user && commentText.trim() && !createCommentMutation.isPending ? "#ffffff" : "#D1D5DB"}
                  />
                </Pressable>
              </View>
              <RNScrollView
                style={styles.drawerCommentsList}
                contentContainerStyle={styles.drawerCommentsContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {commentsData?.comments.length === 0 ? (
                  <Text style={styles.drawerNoComments}>暂无评论，来发表第一条吧~</Text>
                ) : (
                  (commentsData?.comments ?? []).map((comment) => {
                    const card = currentCard;
                    const votedPhoto = card?.photos.find((p: { id: number }) => p.id === comment.votedPhotoId);
                    const photoIndex = votedPhoto && card
                      ? card.photos.findIndex((p: { id: number }) => p.id === comment.votedPhotoId)
                      : -1;
                    return (
                      <View key={comment.id} style={styles.drawerCommentItem}>
                        <View style={styles.drawerCommentAvatarWrap}>
                          {votedPhoto ? (
                            <Image
                              source={{ uri: getImageUrl(votedPhoto.url) }}
                              style={styles.drawerCommentAvatarPhoto}
                              contentFit="cover"
                            />
                          ) : (
                            <View style={styles.drawerCommentAvatar}>
                              <Text style={styles.drawerCommentAvatarText}>{comment.userName.slice(-2)}</Text>
                            </View>
                          )}
                          {votedPhoto && photoIndex >= 0 && (
                            <View style={styles.drawerPhotoNumBadge}>
                              <Text style={styles.drawerPhotoNumText}>{photoIndex + 1}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.drawerCommentBody}>
                          <View style={styles.drawerCommentRow}>
                            <Text style={styles.drawerCommentUser}>{comment.userName}</Text>
                            {votedPhoto && photoIndex >= 0 && (
                              <View style={styles.drawerVoteBadge}>
                                <IconSymbol name="checkmark.circle.fill" size={12} color="#6366F1" />
                                <Text style={styles.drawerVoteBadgeText}>第 {photoIndex + 1} 张</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.drawerCommentContent}>{comment.content}</Text>
                          <Text style={styles.drawerCommentTime}>
                            {new Date(comment.createdAt).toLocaleString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </RNScrollView>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  fullScreen: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 16,
    marginTop: 12,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a2e",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  restButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  timerContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    gap: 8,
  },
  timerBar: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  timerFill: {
    height: "100%",
    borderRadius: 3,
  },
  timerText: {
    fontSize: 16,
    fontWeight: "bold",
    width: 30,
  },
  content: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 100,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginBottom: 24,
  },
  loginHint: {
    marginBottom: 12,
    alignSelf: "center",
  },
  loginHintText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textDecorationLine: "underline",
  },
  photosGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    alignContent: "center",
  },
  photoCard: {
    width: "47%",
    aspectRatio: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#2a2a3e",
  },
  photoCardLarge: {
    width: "65%",
    aspectRatio: 1,
  },
  photoCardFull: {
    width: "65%",
  },
  photoCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  // Result styles
  resultsList: {
    flex: 1,
    gap: 16,
    justifyContent: "center",
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: 12,
    gap: 16,
  },
  resultItemSelected: {
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    borderWidth: 2,
    borderColor: "#6366F1",
  },
  resultPhoto: {
    width: 70,
    height: 70,
    borderRadius: 12,
  },
  resultStats: {
    flex: 1,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultPercentage: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
  },
  uploadOrderText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  yourChoiceBadge: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  yourChoiceText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "bold",
  },
  resultVotes: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
    marginBottom: 8,
  },
  resultBar: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  resultBarFill: {
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 3,
  },
  resultBarFillSelected: {
    backgroundColor: "#6366F1",
  },
  totalVotes: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 20,
  },
  backHomeButton: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  backHomeText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  // Action buttons styles
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.5)",
  },
  actionButtonActive: {
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    borderColor: "#6366F1",
  },
  actionButtonText: {
    color: "#6366F1",
    fontSize: 15,
    fontWeight: "600",
  },
  actionButtonTextActive: {
    color: "#EF4444",
  },
  // Comments styles (kept for backward compatibility)
  commentsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.5)",
  },
  commentsToggleText: {
    color: "#6366F1",
    fontSize: 15,
    fontWeight: "600",
  },
  commentsSection: {
    marginTop: 20,
    maxHeight: 300,
  },
  commentInputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 16,
  },
  commentInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#ffffff",
    fontSize: 14,
    maxHeight: 80,
  },
  commentSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  commentSendButtonDisabled: {
    backgroundColor: "rgba(99, 102, 241, 0.3)",
  },
  commentsList: {
    maxHeight: 200,
  },
  noComments: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  commentItem: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  commentAvatarContainer: {
    position: "relative",
    width: 44,
    height: 44,
  },
  commentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  commentAvatarPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(99, 102, 241, 0.5)",
  },
  photoNumberBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1a1a2e",
  },
  photoNumberText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "bold",
  },
  commentAvatarText: {
    color: "#6366F1",
    fontSize: 12,
    fontWeight: "bold",
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  commentUser: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "600",
  },
  voteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  voteBadgeText: {
    color: "#6366F1",
    fontSize: 11,
    fontWeight: "600",
  },
  commentText: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  commentTime: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 32,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  modalIcon: {
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#11181C",
    marginBottom: 12,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 16,
    color: "#687076",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  modalActions: {
    width: "100%",
    gap: 12,
  },
  modalButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: "center",
  },
  modalButtonPrimary: {
    backgroundColor: "#6366F1",
  },
  modalButtonPressed: {
    opacity: 0.8,
  },
  modalButtonTextPrimary: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  // 评论区抽屉
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  commentsDrawer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.7,
    minHeight: 280,
  },
  drawerHandleWrap: {
    alignItems: "center",
    paddingVertical: 12,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#11181C",
  },
  drawerCloseBtn: {
    padding: 4,
  },
  drawerBody: {
    flex: 1,
    paddingHorizontal: 20,
    minHeight: 200,
  },
  drawerInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 12,
  },
  drawerInput: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#11181C",
    fontSize: 14,
    maxHeight: 80,
  },
  drawerSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerSendBtnDisabled: {
    backgroundColor: "#E5E7EB",
  },
  drawerCommentsList: {
    flex: 1,
    maxHeight: 320,
  },
  drawerCommentsContent: {
    paddingBottom: 24,
  },
  drawerNoComments: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 24,
  },
  drawerCommentItem: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  drawerCommentAvatarWrap: {
    position: "relative",
    width: 40,
    height: 40,
  },
  drawerCommentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerCommentAvatarPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  drawerCommentAvatarText: {
    color: "#6366F1",
    fontSize: 12,
    fontWeight: "600",
  },
  drawerPhotoNumBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerPhotoNumText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "bold",
  },
  drawerCommentBody: {
    flex: 1,
  },
  drawerCommentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  drawerCommentUser: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
  },
  drawerVoteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  drawerVoteBadgeText: {
    color: "#6366F1",
    fontSize: 11,
    fontWeight: "600",
  },
  drawerCommentContent: {
    color: "#11181C",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  drawerCommentTime: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  swipeHintContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
  },
  modalSwipeHint: {
    color: "rgba(0,0,0,0.4)",
    fontSize: 14,
  },
});
