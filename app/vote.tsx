import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView, ScrollView as RNScrollView, Modal, Image as RNImage } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useDeviceId } from "@/hooks/use-device-id";
import { trpc } from "@/lib/trpc";
import { getImageUrl } from "@/lib/utils";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  interpolateColor,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const VOTE_DURATION = 5;
const SWIPE_THRESHOLD = SCREEN_HEIGHT * 0.08; // 8% 屏高，轻滑即可切换
const TIMEOUT_LIMIT = 10; // 10次超时后提示休息
const TIMEOUT_COUNT_KEY = "@vote_timeout_count";
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
  const { deviceId, loading: deviceLoading } = useDeviceId();
  
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
  
  // Timeout tracking state
  const [timeoutCount, setTimeoutCount] = useState(0);
  const [showBreakModal, setShowBreakModal] = useState(false);
  
  // Timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeLeftRef = useRef(VOTE_DURATION);
  
  // Animation values
  const translateY = useSharedValue(0);
  const progress = useSharedValue(1);
  const timeLeft = useSharedValue(VOTE_DURATION);
  const cardOpacity = useSharedValue(1);

  const utils = trpc.useUtils();

  // 拉取一批卡片（用于初始加载与队列补货）
  const fetchBatch = useCallback(async (excludeCardIds: number[]): Promise<VoteCardData[]> => {
    if (!deviceId) return [];
    const batch = await utils.cards.getRandomForVotingBatch.fetch({
      deviceId,
      count: PREFETCH_COUNT,
      excludeCardIds: excludeCardIds.length > 0 ? excludeCardIds : undefined,
    });
    return batch as VoteCardData[];
  }, [deviceId, utils.cards.getRandomForVotingBatch]);

  // Load timeout count on mount
  useEffect(() => {
    const loadTimeoutCount = async () => {
      try {
        const stored = await AsyncStorage.getItem(TIMEOUT_COUNT_KEY);
        if (stored) {
          setTimeoutCount(parseInt(stored, 10));
        }
      } catch (error) {
        console.error("Failed to load timeout count:", error);
      }
    };
    loadTimeoutCount();
  }, []);

  // 初始加载或队列被清空时：拉取一批卡片
  useEffect(() => {
    if (!deviceId || cardQueue.length > 0 || isTransitioning) return;
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
  }, [deviceId, cardQueue.length, isTransitioning, fetchBatch]);

  const { data: voteStats, refetch: refetchStats } = trpc.votes.getDailyCount.useQuery(
    { deviceId: deviceId ?? "" },
    { enabled: !!deviceId }
  );

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
    { cardId: currentCard?.id ?? 0, deviceId: deviceId ?? "" },
    { enabled: !!currentCard && !!deviceId && showResult }
  );

  // Favorite queries
  const { data: favoriteData, refetch: refetchFavorite } = trpc.favorites.check.useQuery(
    { cardId: currentCard?.id ?? 0, deviceId: deviceId ?? "" },
    { enabled: !!currentCard && !!deviceId && showResult }
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
    if (!commentText.trim() || !currentCard || !deviceId) return;
    
    createCommentMutation.mutate({
      cardId: currentCard.id,
      deviceId,
      content: commentText.trim(),
    });
  }, [commentText, currentCard, deviceId, createCommentMutation]);

  const handleToggleFavorite = useCallback(() => {
    if (!currentCard || !deviceId) return;
    
    toggleFavoriteMutation.mutate({
      cardId: currentCard.id,
      deviceId,
    });
  }, [currentCard, deviceId, toggleFavoriteMutation]);

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

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goToNextCard = useCallback(() => {
    setIsTransitioning(true);
    stopTimer();
    cardOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(resetAndFetchNext)();
    });
  }, [stopTimer]);

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
    refetchStats();

    const prevId = currentCard?.id;
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
  }, [currentCard, cardQueue, fetchBatch, refetchStats]);

  const handleTimeUp = useCallback(() => {
    stopTimer();
    
    // Increment timeout count
    const newCount = timeoutCount + 1;
    setTimeoutCount(newCount);
    AsyncStorage.setItem(TIMEOUT_COUNT_KEY, newCount.toString()).catch(console.error);
    
    // Check if reached timeout limit
    if (newCount >= TIMEOUT_LIMIT) {
      setShowBreakModal(true);
      // Don't go to next card automatically
    } else {
      goToNextCard();
    }
  }, [stopTimer, goToNextCard, timeoutCount]);

  const startTimer = useCallback(() => {
    stopTimer();
    timeLeftRef.current = VOTE_DURATION;
    progress.value = 1;
    timeLeft.value = VOTE_DURATION;
    
    progress.value = withTiming(0, {
      duration: VOTE_DURATION * 1000,
      easing: Easing.linear,
    });

    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      timeLeft.value = timeLeftRef.current;
      
      if (timeLeftRef.current <= 0) {
        stopTimer();
        handleTimeUp();
      }
    }, 1000);
  }, [handleTimeUp, stopTimer]);

  // Start timer when card is ready
  useEffect(() => {
    if (currentCard && !showResult && !selectedPhotoId) {
      startTimer();
    }
    return () => stopTimer();
  }, [currentCard?.id, showResult]);

  const handleSelectPhoto = useCallback((photoId: number) => {
    if (selectedPhotoId !== null || !deviceId || !currentCard) return;

    setSelectedPhotoId(photoId);
    stopTimer();
    
    // Reset timeout count on successful vote
    setTimeoutCount(0);
    AsyncStorage.setItem(TIMEOUT_COUNT_KEY, "0").catch(console.error);

    submitVoteMutation.mutate({
      deviceId,
      cardId: currentCard.id,
      photoId,
    });
  }, [selectedPhotoId, deviceId, currentCard, stopTimer, submitVoteMutation]);

  const handleBack = useCallback(() => {
    stopTimer();
    router.push("/(tabs)");
  }, [stopTimer, router]);

  const handleTakeBreak = useCallback(() => {
    stopTimer(); // 停止计时器
    setShowBreakModal(false);
    // Reset timeout count
    setTimeoutCount(0);
    AsyncStorage.setItem(TIMEOUT_COUNT_KEY, "0").catch(console.error);
    AsyncStorage.setItem(SKIP_VOTE_REDIRECT_KEY, "1").catch(console.error);
    router.replace("/");
  }, [router, stopTimer]);

  const handleContinueVoting = useCallback(() => {
    setShowBreakModal(false);
    // Reset timeout count
    setTimeoutCount(0);
    AsyncStorage.setItem(TIMEOUT_COUNT_KEY, "0").catch(console.error);
    goToNextCard();
  }, [goToNextCard]);

  // Swipe gesture - always enabled (can skip voting or go to next)
  const swipeGesture = useMemo(() => 
    Gesture.Pan()
      .enabled(true) // 始终启用，允许下滑跳过投票
      .onUpdate((event) => {
        if (event.translationY < 0) {
          translateY.value = event.translationY;
        }
      })
      .onEnd((event) => {
        if (event.translationY < -SWIPE_THRESHOLD) {
          if (showBreakModal) {
            // 休息弹窗时：下滑继续投票
            translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 200, easing: Easing.out(Easing.cubic) }, () => {
              runOnJS(handleContinueVoting)();
            });
          } else if (showResult) {
            // 评论区抽屉打开时不允许切换下一张，先关闭抽屉
            if (showComments) {
              translateY.value = withSpring(0, { damping: 15 });
              return;
            }
            // 结果页面：下滑到下一个
            translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 200, easing: Easing.out(Easing.cubic) }, () => {
              runOnJS(goToNextCard)();
            });
          } else {
            // 投票阶段：下滑跳过（当作超时处理）
            translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 200, easing: Easing.out(Easing.cubic) }, () => {
              runOnJS(handleTimeUp)();
            });
          }
        } else {
          translateY.value = withSpring(0, { damping: 15 });
        }
      })
      .runOnJS(true),
    [showResult, showBreakModal, showComments, goToNextCard, handleContinueVoting, handleTimeUp]
  );

  // Animated styles
  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: cardOpacity.value,
  }));

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

  const animatedTimeStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      progress.value,
      [0, 0.3, 0.6, 1],
      ["#EF4444", "#F59E0B", "#22C55E", "#22C55E"]
    );
    return { color };
  });

  const swipeHintStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [-100, -50, 0],
      [1, 0.5, 0.3],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  // Loading state
  if (deviceLoading) {
    return (
      <View style={[styles.fullScreen, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  // Daily limit reached
  if (voteStats && voteStats.remaining <= 0) {
    return (
      <View style={[styles.fullScreen, { paddingTop: insets.top }]}>
        <Pressable onPress={handleTakeBreak} style={styles.restButton}>
          <IconSymbol name="xmark" size={24} color="#ffffff" />
        </Pressable>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>今日投票次数已用完</Text>
          <Text style={styles.emptySubtitle}>明天再来继续投票吧</Text>
          <Pressable onPress={handleTakeBreak} style={styles.backHomeButton}>
            <Text style={styles.backHomeText}>返回首页</Text>
          </Pressable>
        </View>
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
            
            {!showResult && (
              <View style={styles.timerContainer}>
                <View style={styles.timerBar}>
                  <Animated.View style={[styles.timerFill, animatedBarStyle]} />
                </View>
                <Animated.Text style={[styles.timerText, animatedTimeStyle]}>
                  {Math.ceil(timeLeft.value)}s
                </Animated.Text>
              </View>
            )}
            
            <View style={styles.statsContainer}>
              <Text style={styles.statsText}>{voteStats?.remaining ?? 20}/20</Text>
            </View>
          </View>

          {/* Main content */}
          <View style={styles.content}>
            {!showResult ? (
              // Voting mode
              <>
                <Text style={styles.title}>选择你喜欢的</Text>
                <Text style={styles.subtitle}>5秒内选择 · 上滑跳过</Text>
                
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
                <Text style={styles.subtitle}>
                  {showComments ? "点击关闭评论区" : "上滑查看下一个"}
                </Text>
                
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

                {/* Swipe hint - 关闭评论区抽屉后才能上滑下一张 */}
                {!showComments ? (
                  <Animated.View style={[styles.swipeHint, swipeHintStyle]}>
                    <IconSymbol name="chevron.up" size={24} color="rgba(255,255,255,0.6)" />
                    <Text style={styles.swipeHintText}>上滑继续</Text>
                  </Animated.View>
                ) : null}
              </>
            )}
          </View>
        </Animated.View>
      </GestureDetector>
      
      {/* Break Modal */}
      <Modal
        visible={showBreakModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <IconSymbol name="cup.and.saucer.fill" size={64} color="#6366F1" />
            </View>
            
            <Text style={styles.modalTitle}>该休息一下啦</Text>
            <Text style={styles.modalSubtitle}>
              你已经连续{timeoutCount}次超时未选择{"\n"}
              放松一下，稍后再来投票吧
            </Text>
            
            <View style={styles.modalActions}>
              <Pressable
                onPress={handleTakeBreak}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  pressed && styles.modalButtonPressed,
                ]}
              >
                <Text style={styles.modalButtonTextPrimary}>休息一下</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
                  placeholder="写下你的想法..."
                  placeholderTextColor="#9CA3AF"
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                />
                <Pressable
                  onPress={handleSubmitComment}
                  disabled={!commentText.trim() || createCommentMutation.isPending}
                  style={[
                    styles.drawerSendBtn,
                    (!commentText.trim() || createCommentMutation.isPending) && styles.drawerSendBtnDisabled,
                  ]}
                >
                  <IconSymbol
                    name="paperplane.fill"
                    size={20}
                    color={commentText.trim() && !createCommentMutation.isPending ? "#ffffff" : "#D1D5DB"}
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
                              <Text style={styles.drawerCommentAvatarText}>{comment.deviceId.slice(-2)}</Text>
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
                            <Text style={styles.drawerCommentUser}>用户 {comment.deviceId.slice(-4)}</Text>
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
  statsContainer: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statsText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
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
  swipeHint: {
    alignItems: "center",
    marginTop: 24,
  },
  swipeHintText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    marginTop: 4,
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
