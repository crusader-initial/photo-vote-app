import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Image as RNImage, Dimensions, ActivityIndicator, Modal, Platform, Alert, TextInput, KeyboardAvoidingView, ScrollView as RNScrollView } from "react-native";
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
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView as GHScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_HEIGHT * 0.08;
const BATCH_SIZE = 50;
const QUEUE_MAX = 200;
const QUEUE_KEEP = 50;
const REFILL_THRESHOLD = 5;

/** "YYYY-MM-DD" -> "YYYY年M月D日" */
function formatVoteDate(voteDate: string): string {
  const [y, m, d] = voteDate.split("-");
  if (!y || !m || !d) return voteDate;
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  return `${y}年${month}月${day}日`;
}

interface VoteCardData {
  id: number;
  title?: string | null;
  photos: { id: number; url: string; photoIndex: number; voteCount: number }[];
  totalVotes: number;
}

export default function ImageTestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [currentCard, setCurrentCard] = useState<VoteCardData | null>(null);
  const [cardQueue, setCardQueue] = useState<VoteCardData[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  /** 本次会话所有已入队的卡片 ID，用于服务端排重 */
  const sessionQueueIdsRef = useRef<number[]>([]);
  const isRefillInProgress = useRef(false);
  const [previousCards, setPreviousCards] = useState<VoteCardData[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [voteResult, setVoteResult] = useState<{ percentage: number; voteCount: number; totalVotes: number } | null>(null);
  const [allPhotoStats, setAllPhotoStats] = useState<{ id: number; percentage: number; voteCount: number }[]>([]);
  const [userVotedAt, setUserVotedAt] = useState<string | null>(null); // voteDate "YYYY-MM-DD" 用于展示「某年某月某日参与投票」
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);

  // 全屏图片查看器：点击图片展开，横滑可查看同组其他图
  const [expandedPhotoIndex, setExpandedPhotoIndex] = useState<number | null>(null);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState(0);
  const imageViewerScrollRef = useRef<RNScrollView>(null);

  const lastTapRef = useRef(0);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(0);
  const cardOpacity = useSharedValue(1);

  const utils = trpc.useUtils();

  const fetchBatch = useCallback(
    async (excludeCardIds: number[]): Promise<VoteCardData[]> => {
      const batch = await utils.cards.getRandomForVotingBatch.fetch({
        count: BATCH_SIZE,
        excludeCardIds: excludeCardIds.length > 0 ? excludeCardIds : undefined,
      });
      const fetched = (batch as VoteCardData[]).filter((c) => c.photos && c.photos.length > 0);
      if (user) {
        fetched.forEach((card) => {
          utils.votes.myVoteResult.prefetch({ cardId: card.id }).catch(() => {});
        });
      }
      return fetched;
    },
    [utils.cards.getRandomForVotingBatch, utils.votes.myVoteResult, user]
  );

  /**
   * 从服务端拉取一批新卡片，追加到会话队列。
   *
   * isInitial=false（后台补充）：
   *   服务端返 0 → 静默忽略，display buffer 里还有卡，等自然耗尽再重置
   *
   * isInitial=true（buffer 已空，用户无牌可看）：
   *   服务端返 0 → 此时才清空 sessionQueueIds 并重新拉取，开始新一轮循环
   *   使用函数式更新，避免与 back-swipe 竞争覆盖已恢复的卡片
   */
  const performRefill = useCallback(
    async (isInitial: boolean) => {
      if (isRefillInProgress.current) return;
      isRefillInProgress.current = true;
      if (isInitial) setQueueLoading(true);

      try {
        let batch = await fetchBatch([...sessionQueueIdsRef.current]);

        if (batch.length === 0 && isInitial) {
          // buffer 已空且无新卡 → 清空会话，重新开始循环
          sessionQueueIdsRef.current = [];
          batch = await fetchBatch([]);
        }

        if (batch.length > 0) {
          sessionQueueIdsRef.current = [
            ...sessionQueueIdsRef.current,
            ...batch.map((c) => c.id),
          ];
          // 超出 200 时保留最新 50 个（它们正好在 display buffer 里）
          if (sessionQueueIdsRef.current.length >= QUEUE_MAX) {
            sessionQueueIdsRef.current = sessionQueueIdsRef.current.slice(-QUEUE_KEEP);
          }

          if (isInitial) {
            // 函数式更新：若用户已 back-swipe 恢复了卡片，则不覆盖
            setCurrentCard((prev) => (prev !== null ? prev : batch[0] ?? null));
            setCardQueue((prev) => (prev.length > 0 ? prev : batch.slice(1)));
          } else {
            setCardQueue((prev) => [...prev, ...batch]);
          }
        }
      } catch (e) {
        console.error("Refill failed:", e);
      } finally {
        isRefillInProgress.current = false;
        if (isInitial) setQueueLoading(false);
      }
    },
    [fetchBatch]
  );

  useEffect(() => {
    if (currentCard || cardQueue.length > 0 || isTransitioning) return;
    performRefill(true);
  }, [currentCard, cardQueue.length, isTransitioning, performRefill]);

  const submitVoteMutation = trpc.votes.submit.useMutation({
    onSuccess: (data, variables) => {
      // data.photoId 已包含正确的投票照片（无论是本次新投还是已有记录）
      const votedPhotoId = data.photoId;
      setSelectedPhotoId(votedPhotoId);
      if (currentCard) {
        const stats = data.photoStats ?? currentCard.photos.map((photo) => {
          const isSelected = photo.id === votedPhotoId;
          const voteCount = isSelected ? data.voteCount : photo.voteCount;
          const percentage = data.totalVotes > 0 ? Math.round((voteCount / data.totalVotes) * 100) : 0;
          return { id: photo.id, percentage, voteCount };
        });
        setAllPhotoStats(stats);
        // 同步更新 myVoteResult 缓存，确保返回此卡片时直接命中
        utils.votes.myVoteResult.setData(
          { cardId: variables.cardId },
          {
            photoId: votedPhotoId,
            voteCount: data.voteCount,
            percentage: data.percentage,
            totalVotes: data.totalVotes,
            photoStats: stats,
            voteDate: data.voteDate,
            createdAt: new Date(),
          }
        );
      }
      setVoteResult({ percentage: data.percentage, voteCount: data.voteCount, totalVotes: data.totalVotes });
      setUserVotedAt(data.voteDate);
      setShowResult(true);
      setShowComments(false);
    },
    onError: (error) => {
      console.error("Vote error:", error);
      goToNextCard();
    },
  });

  // 查询当前用户是否已对这张卡投过票
  const { data: myVoteResultData, isLoading: isCheckingVote } = trpc.votes.myVoteResult.useQuery(
    { cardId: currentCard?.id ?? 0 },
    { enabled: !!currentCard && !!user }
  );

  const applyPreviousVoteResult = useCallback(
    (data: NonNullable<typeof myVoteResultData>) => {
      setSelectedPhotoId(data.photoId);
      setAllPhotoStats(data.photoStats);
      setVoteResult({ percentage: data.percentage, voteCount: data.voteCount, totalVotes: data.totalVotes });
      setUserVotedAt(data.voteDate);
      setShowResult(true);
      setShowComments(false);
    },
    []
  );


  const { data: commentsData, refetch: refetchComments } = trpc.comments.getByCardId.useQuery(
    { cardId: currentCard?.id ?? 0 },
    { enabled: !!currentCard && !!user && showResult }
  );

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

  const handleSelectPhoto = useCallback(
    (photoId: number) => {
      if (selectedPhotoId !== null || !currentCard) return;
      // 等待已投票检查完成，避免竞态
      if (isCheckingVote) return;
      if (!user) {
        if (Platform.OS === "web") window.alert("请先登录后再投票");
        else Alert.alert("提示", "请先登录后再投票", [{ text: "去登录", onPress: () => router.push("/login") }, { text: "取消" }]);
        return;
      }
      // 已有投票记录：直接展示原有结果，忽略本次选择
      if (myVoteResultData) {
        applyPreviousVoteResult(myVoteResultData);
        return;
      }
      setSelectedPhotoId(photoId);
      submitVoteMutation.mutate({
        cardId: currentCard.id,
        photoId,
      });
    },
    [selectedPhotoId, currentCard, isCheckingVote, myVoteResultData, applyPreviousVoteResult, submitVoteMutation, user, router]
  );

  // 全屏查看打开时滚动到对应索引
  useEffect(() => {
    if (expandedPhotoIndex === null || !currentCard?.photos.length) return;
    const timer = setTimeout(() => {
      imageViewerScrollRef.current?.scrollTo({
        x: expandedPhotoIndex * SCREEN_WIDTH,
        animated: false,
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [expandedPhotoIndex, currentCard?.photos.length]);

  const handlePhotoPress = useCallback(
    (photoId: number, photoIndex: number) => {
      const now = Date.now();
      if (now - lastTapRef.current < 400 && singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
        lastTapRef.current = 0;
        handleSelectPhoto(photoId);
        return;
      }
      lastTapRef.current = now;
      singleTapTimeoutRef.current = setTimeout(() => {
        setViewingPhotoIndex(photoIndex);
        setExpandedPhotoIndex(photoIndex);
        singleTapTimeoutRef.current = null;
      }, 300);
    },
    [handleSelectPhoto]
  );

  const resetAndFetchNext = useCallback(() => {
    setShowResult(false);
    setVoteResult(null);
    setUserVotedAt(null);
    setSelectedPhotoId(null);
    setAllPhotoStats([]);
    setShowComments(false);
    setCommentText("");
    setIsFavorited(false);
    setExpandedPhotoIndex(null);
    translateY.value = 0;
    cardOpacity.value = 1;

    if (currentCard) {
      setPreviousCards((prev) => [...prev, currentCard]);
    }

    if (cardQueue.length > 0) {
      const [next, ...rest] = cardQueue;
      setCurrentCard(next);
      setCardQueue(rest);
      // 队列剩余不足阈值时后台预拉下一批
      if (rest.length < REFILL_THRESHOLD) {
        performRefill(false);
      }
    } else {
      // 队列已空，useEffect 会触发 performRefill(true)
      setCurrentCard(null);
    }

    setTimeout(() => {
      setIsTransitioning(false);
    }, 50);
  }, [currentCard, cardQueue, performRefill, translateY, cardOpacity]);

  const resetAndShowPrevious = useCallback(() => {
    setShowResult(false);
    setVoteResult(null);
    setUserVotedAt(null);
    setSelectedPhotoId(null);
    setAllPhotoStats([]);
    setShowComments(false);
    setCommentText("");
    setIsFavorited(false);
    setExpandedPhotoIndex(null);
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
  }, [currentCard, translateY, cardOpacity]);

  const goToNextCard = useCallback(() => {
    setIsTransitioning(true);
    cardOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(resetAndFetchNext)();
    });
  }, [resetAndFetchNext, cardOpacity]);

  const goToPreviousCard = useCallback(() => {
    if (previousCards.length === 0 || isTransitioning) return;
    setIsTransitioning(true);
    cardOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(resetAndShowPrevious)();
    });
  }, [previousCards.length, isTransitioning, resetAndShowPrevious, cardOpacity]);

  const canGoBack = previousCards.length > 0;
  const showEmpty =
    !currentCard &&
    !queueLoading &&
    !isTransitioning &&
    previousCards.length === 0;
  const showLoading = !currentCard && (queueLoading || isTransitioning);
  const canSwipePrev = canGoBack;
  const canSwipeNext = !!currentCard && !(showResult && showComments);
  const totalCount = previousCards.length + (currentCard ? 1 : 0) + cardQueue.length;
  const currentIndex = currentCard ? previousCards.length + 1 : 0;
  const progressPct = totalCount > 0 ? Math.min(100, Math.round((currentIndex / totalCount) * 100)) : 0;

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(true)
        .onUpdate((event) => {
          const dragY = event.translationY;
          const isNextDirection = dragY < 0;
          const isPrevDirection = dragY > 0;
          const allowMove =
            (isPrevDirection && canSwipePrev) ||
            (isNextDirection && canSwipeNext);
          // 禁止方向直接锁死，避免出现“可拉动但过不去”
          translateY.value = allowMove ? dragY : 0;
        })
        .onEnd((event) => {
          const toNext = event.translationY <= -SWIPE_THRESHOLD && canSwipeNext;
          const toPrev = event.translationY >= SWIPE_THRESHOLD && canSwipePrev;
          if (toPrev) {
            translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 }, () => {
              runOnJS(goToPreviousCard)();
            });
          } else if (toNext) {
            translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 200 }, () => {
              runOnJS(goToNextCard)();
            });
          } else {
            translateY.value = 0;
          }
        })
        .runOnJS(true),
    [canSwipePrev, canSwipeNext, goToNextCard, goToPreviousCard, translateY]
  );

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: cardOpacity.value,
  }));

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.fullScreen, animatedCardStyle]}>
          <View style={styles.background} />

          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <View style={styles.headerSpacer} />
          </View>

          {showLoading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.stateText}>加载中...</Text>
            </View>
          ) : !currentCard && previousCards.length > 0 && !queueLoading && !isTransitioning ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>当前无新卡片</Text>
              <Pressable onPress={goToPreviousCard} style={styles.backToPrevBtn}>
                <Text style={styles.backToPrevText}>返回上一张</Text>
              </Pressable>
            </View>
          ) : showEmpty ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>暂无可展示图片</Text>
            </View>
          ) : (
            <View style={styles.content}>
              {!showResult ? (
                <>
                  {(() => {
                    const t = currentCard?.title || "选择你喜欢的";
                    return (
                      <Text style={[styles.voteTitle, t.length > 8 && styles.voteTitleSmall]}>
                        {t}
                      </Text>
                    );
                  })()}
                  <Text style={styles.voteSubtitle}>双击进行投票</Text>
                  {(() => {
                    const count = currentCard!.photos.length;
                    const renderCard = (photo: VoteCardData["photos"][number], style: any, photoIndex: number) => (
                      <Pressable
                        key={photo.id}
                        onPress={() => handlePhotoPress(photo.id, photoIndex)}
                        disabled={selectedPhotoId !== null}
                        style={[styles.photoCard, style]}
                      >
                        <View style={styles.photoImageWrap}>
                          <RNImage
                            source={{ uri: getImageUrl(photo.url) }}
                            style={styles.photoImage}
                            resizeMode="cover"
                            onError={(e) => {
                              console.warn("[vote-flow] image load failed", {
                                photoId: photo.id,
                                url: getImageUrl(photo.url),
                                error: e?.nativeEvent?.error,
                              });
                            }}
                          />
                        </View>
                      </Pressable>
                    );

                    if (count === 4) {
                      const rows = [
                        currentCard!.photos.slice(0, 2),
                        currentCard!.photos.slice(2, 4),
                      ];
                      return (
                        <View style={styles.photoBlockOffset}><View style={styles.photosGridTwoColumn}>
                          {rows.map((row, rowIndex) => (
                            <View key={`row-${rowIndex}`} style={styles.photoRow}>
                              {row.map((photo) => renderCard(photo, styles.photoCardGrid, currentCard!.photos.indexOf(photo)))}
                            </View>
                          ))}
                        </View></View>
                  );
                    }

                    if (count === 3) {
                      const firstRow = currentCard!.photos.slice(0, 2);
                      const secondRow = currentCard!.photos.slice(2, 3);
                      return (
                        <View style={styles.photoBlockOffset}><View style={styles.photosGridTwoColumn}>
                          <View style={styles.photoRow}>
                            {firstRow.map((photo) => renderCard(photo, styles.photoCardGrid, currentCard!.photos.indexOf(photo)))}
                          </View>
                          <View style={styles.photoRowCenter}>
                            {secondRow.map((photo) => renderCard(photo, styles.photoCardGrid, currentCard!.photos.indexOf(photo)))}
                          </View>
                        </View></View>
                  );
                    }

                    return (
                      <View style={count === 2 ? styles.photoBlockOffsetTwo : styles.photoBlockOffset}>
                        <View style={[styles.photosGrid, styles.photosGridSingleColumn]}>
                          {currentCard!.photos.map((photo, idx) =>
                            renderCard(photo, count === 2 ? styles.photoCardLarge : styles.photoCardFull, idx)
                          )}
                        </View>
                      </View>
                    );
                  })()}
                </>
              ) : (
                <>
                  <Text style={styles.voteTitle}>投票结果</Text>
                  {userVotedAt ? (
                    <Text style={styles.voteDateSubtitle}>
                      {formatVoteDate(userVotedAt)}参与投票
                    </Text>
                  ) : null}
                  {showComments ? <Text style={styles.voteSubtitle}>点击关闭评论区</Text> : null}
                  <View style={styles.resultsList}>
                    {currentCard!.photos.map((photo) => {
                      const stats = allPhotoStats.find((s) => s.id === photo.id);
                      const isSelected = photo.id === selectedPhotoId;
                      const percentage = stats?.percentage ?? 0;
                      const voteCount = stats?.voteCount ?? photo.voteCount;
                      return (
                        <View
                          key={photo.id}
                          style={[styles.resultItem, isSelected && styles.resultItemSelected]}
                        >
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
                              <View
                                style={[
                                  styles.resultBarFill,
                                  { width: `${percentage}%` },
                                  isSelected && styles.resultBarFillSelected,
                                ]}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.totalVotes}>共 {voteResult?.totalVotes ?? 0} 人参与投票</Text>
                  <View style={styles.actionButtonsRow}>
                    <Pressable
                      onPress={handleToggleFavorite}
                      disabled={toggleFavoriteMutation.isPending}
                      style={[styles.actionButton, isFavorited && styles.actionButtonActive]}
                    >
                      <IconSymbol
                        name={isFavorited ? "heart.fill" : "heart"}
                        size={20}
                        color={isFavorited ? "#EF4444" : "#6366F1"}
                      />
                      <Text style={[styles.actionButtonText, isFavorited && styles.actionButtonTextActive]}>
                        {isFavorited ? "已收藏" : "收藏"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowComments(!showComments)}
                      style={[styles.actionButton, showComments && styles.actionButtonActive]}
                    >
                      <IconSymbol name="bubble.left.fill" size={20} color="#6366F1" />
                      <Text style={styles.actionButtonText}>
                        {showComments ? "收起" : "查看"}评论
                        {commentsData?.comments.length ? ` (${commentsData.comments.length})` : ""}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}
          <Modal
            visible={!!currentCard && showComments && !!(commentsData?.canView)}
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
                        (!user || !commentText.trim() || createCommentMutation.isPending) &&
                          styles.drawerSendBtnDisabled,
                      ]}
                    >
                      <IconSymbol
                        name="paperplane.fill"
                        size={20}
                        color={
                          user && commentText.trim() && !createCommentMutation.isPending
                            ? "#ffffff"
                            : "#D1D5DB"
                        }
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
                        const votedPhoto = comment.votedPhotoId != null
                          ? card?.photos.find((p) => p.id === comment.votedPhotoId)
                          : undefined;
                        const photoIndex =
                          votedPhoto && card
                            ? card.photos.findIndex((p) => p.id === comment.votedPhotoId)
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
                                  <Text style={styles.drawerCommentAvatarText}>
                                    {comment.userName.slice(-2)}
                                  </Text>
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
          {/* 全屏图片查看器：横滑可切换同组其他图，点击任意处关闭 */}
          <Modal
            visible={expandedPhotoIndex !== null && !!currentCard}
            transparent
            animationType="fade"
            onRequestClose={() => setExpandedPhotoIndex(null)}
          >
            <View style={styles.imageViewerOverlay}>
            <RNScrollView
              ref={imageViewerScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.imageViewerScroll}
              contentContainerStyle={styles.imageViewerScrollContent}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setViewingPhotoIndex(Math.min(Math.max(0, index), (currentCard?.photos.length ?? 1) - 1));
              }}
              scrollEventThrottle={16}
            >
              {(currentCard?.photos ?? []).map((item) => (
                <Pressable key={item.id} style={styles.imageViewerPage} onPress={() => setExpandedPhotoIndex(null)}>
                  <Image
                    source={{ uri: getImageUrl(item.url) }}
                    style={styles.imageViewerImage}
                    contentFit="contain"
                  />
                </Pressable>
              ))}
            </RNScrollView>
            </View>
          </Modal>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  fullScreen: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  background: {
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
    gap: 12,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  content: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 24,
    paddingTop: 110,
    paddingBottom: 100,
  },
  voteTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    marginTop: -SCREEN_HEIGHT * 0.05,
    marginBottom: 20,
  },
  voteDateSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    marginTop: -20,
    marginBottom: 0,
  },
  voteTitleSmall: {
    fontSize: 22,
  },
  voteSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginTop: -12,
    marginBottom: 12,
  },
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
    color: "#64748B",
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
    color: "#64748B",
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
    paddingHorizontal: 16,
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
    paddingHorizontal: 16,
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
    paddingHorizontal: 16,
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
  stateBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  stateText: {
    fontSize: 14,
    color: "#64748B",
  },
  backToPrevBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#0F172A",
  },
  backToPrevText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
  },
  photosGrid: {
    paddingBottom: 24,
    gap: 12,
  },
  photosGridSingleColumn: {
    flexDirection: "column",
    alignItems: "center",
  },
  photoBlockOffset: {
    marginTop: SCREEN_HEIGHT * 0.05,
  },
  photoBlockOffsetTwo: {
    marginTop: SCREEN_HEIGHT * 0.02,
  },
  photosGridTwoColumn: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "stretch",
    width: "100%",
  },
  photoRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  photoRowCenter: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 8,
  },
  photoCard: {
    width: "100%",
    backgroundColor: "transparent",
    borderRadius: 12,
    padding: 0,
    borderWidth: 0,
    borderColor: "transparent",
    aspectRatio: 1,
    overflow: "hidden",
  },
  photoCardGrid: {
    width: "49%",
    aspectRatio: 1,
    flexBasis: "49%",
  },
  photoCardLarge: {
    width: "80%",
    aspectRatio: 1,
    alignSelf: "center",
  },
  photoCardFull: {
    width: "100%",
    aspectRatio: 1,
  },
  photoImageWrap: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: "#000000",
  },
  imageViewerScroll: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  imageViewerScrollContent: {
    flexDirection: "row",
  },
  imageViewerPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  imageViewerImage: {
    width: SCREEN_WIDTH,
    height: "100%",
  },
});
