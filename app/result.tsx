import { useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { getImageUrl } from "@/lib/utils";

const SKIP_VOTE_REDIRECT_KEY = "@skip_vote_redirect";

type CommentWithVote = { id: number; userName: string; content: string; createdAt: Date; votedPhotoId: number | null; replyCount?: number };
type ReplyBlock = { replies: CommentWithVote[]; parentUserName: string };

export default function ResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cardId: string; from?: string }>();
  const cardId = params.cardId ? parseInt(params.cardId, 10) : 0;
  const fromFavorites = params.from === "favorites";
  const { user } = useAuth();

  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ commentId: number; userName: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<number, ReplyBlock>>({});
  const [loadingReplies, setLoadingReplies] = useState<Record<number, boolean>>({});

  const { data: card } = trpc.cards.getById.useQuery(
    { cardId },
    { enabled: cardId > 0 }
  );

  const { data: commentsData, refetch: refetchComments } = trpc.comments.getByCardId.useQuery(
    { cardId },
    { enabled: cardId > 0 && !!user }
  );

  const { data: favoriteData } = trpc.favorites.check.useQuery(
    { cardId },
    { enabled: cardId > 0 && !!user }
  );
  const isFavorited = favoriteData?.isFavorited ?? false;

  const utils = trpc.useUtils();
  const toggleFavoriteMutation = trpc.favorites.toggle.useMutation({
    onSuccess: () => {
      utils.favorites.check.invalidate();
      utils.favorites.getMyFavorites.invalidate();
    },
  });

  const createCommentMutation = trpc.comments.create.useMutation({
    onSuccess: (_data, vars) => {
      setCommentText("");
      setReplyingTo(null);
      refetchComments();
      if (vars.parentId != null) {
        setExpandedReplies((prev) => {
          const next = { ...prev };
          delete next[vars.parentId!];
          return next;
        });
      }
    },
  });

  const handleBack = () => {
    if (fromFavorites) {
      router.back();
      return;
    }
    AsyncStorage.setItem(SKIP_VOTE_REDIRECT_KEY, "1").catch(console.error);
    router.replace("/");
  };

  const handleSubmitComment = () => {
    if (!commentText.trim() || !cardId) return;
    if (!user) {
      if (Platform.OS === "web") window.alert("请先登录后评论");
      else Alert.alert("提示", "请先登录后评论", [{ text: "去登录", onPress: () => router.push("/login") }, { text: "取消" }]);
      return;
    }
    createCommentMutation.mutate({
      cardId,
      content: commentText.trim(),
      parentId: replyingTo?.commentId,
    });
  };

  const handleExpandReplies = useCallback(async (parentId: number) => {
    if (!cardId || loadingReplies[parentId] || expandedReplies[parentId]) return;
    setLoadingReplies((p) => ({ ...p, [parentId]: true }));
    try {
      const res = await utils.comments.getReplies.fetch({ parentId, cardId });
      if (res.replies.length > 0 || res.parentUserName) {
        setExpandedReplies((prev) => ({ ...prev, [parentId]: { replies: res.replies as CommentWithVote[], parentUserName: res.parentUserName ?? "" } }));
      }
    } finally {
      setLoadingReplies((p) => ({ ...p, [parentId]: false }));
    }
  }, [cardId, utils.comments.getReplies, loadingReplies, expandedReplies]);

  const handleReplyClick = useCallback((commentId: number, userName: string) => {
    setReplyingTo({ commentId, userName });
  }, []);

  const handleToggleFavorite = () => {
    if (!cardId || toggleFavoriteMutation.isPending) return;
    if (!user) {
      if (Platform.OS === "web") window.alert("请先登录后收藏");
      else Alert.alert("提示", "请先登录后收藏", [{ text: "去登录", onPress: () => router.push("/login") }, { text: "取消" }]);
      return;
    }
    toggleFavoriteMutation.mutate({ cardId });
  };

  if (!card) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text style={styles.loadingText}>加载中...</Text>
      </ScreenContainer>
    );
  }

  const totalVotes = card.photos.reduce((sum, p) => sum + p.voteCount, 0);
  const sortedPhotos = [...card.photos].sort((a, b) => b.voteCount - a.voteCount);

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} className="flex-1">
      <View style={styles.page}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <IconSymbol name="arrow.left" size={24} color="#11181C" />
          </Pressable>
          <Text style={styles.title}>投票结果</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Card title & description */}
        {(card.title || card.description) && (
          <View style={styles.cardCopyContainer}>
            {card.title ? (
              <Text style={styles.cardTitle}>{card.title}</Text>
            ) : null}
            {card.description ? (
              <Text style={styles.cardDescription}>{card.description}</Text>
            ) : null}
          </View>
        )}

        {/* Results List */}
        <View style={styles.resultsContainer}>
          {sortedPhotos.map((photo, index) => {
            const percentage = totalVotes > 0
              ? Math.round((photo.voteCount / totalVotes) * 100)
              : 0;
            const isWinner = index === 0;

            return (
              <View key={photo.id} style={styles.resultItem}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{index + 1}</Text>
                </View>
                
                <View style={styles.photoWrapper}>
                  <Image
                    source={{ uri: getImageUrl(photo.url) }}
                    style={styles.resultPhoto}
                    contentFit="cover"
                  />
                  {isWinner && (
                    <View style={styles.winnerBadge}>
                      <Text style={styles.winnerText}>👑</Text>
                    </View>
                  )}
                </View>

                <View style={styles.statsContainer}>
                  <View style={styles.statsRow}>
                    <Text style={styles.percentageText}>{percentage}%</Text>
                    <Text style={styles.uploadOrderText}>上传第 {photo.photoIndex + 1} 张</Text>
                  </View>
                  <Text style={styles.voteCountText}>{photo.voteCount} 票</Text>
                  
                  {/* Progress bar */}
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${percentage}%` },
                        isWinner && styles.progressWinner,
                      ]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Summary */}
        <View style={styles.summaryContainer}>
          <Text style={styles.summaryText}>
            共收到 {totalVotes} 票
          </Text>
        </View>

        {/* 评论区 - 跟进投票情况和讨论 */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsSectionTitle}>评论区</Text>
          {commentsData?.canView ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.commentsBlock}
            >
              {/* 评论输入：回复时显示前缀 */}
              {replyingTo && (
                <View style={styles.replyPrefixRow}>
                  <Text style={styles.replyPrefixText}>回复 @{replyingTo.userName}:</Text>
                  <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
                    <IconSymbol name="xmark" size={16} color="#9CA3AF" />
                  </Pressable>
                </View>
              )}
              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  placeholder={!user ? "请先登录后评论" : replyingTo ? "输入回复..." : "写下你的想法..."}
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
                    styles.commentSendBtn,
                    (!user || !commentText.trim() || createCommentMutation.isPending) && styles.commentSendBtnDisabled,
                  ]}
                >
                  <IconSymbol
                    name="paperplane.fill"
                    size={20}
                    color={user && commentText.trim() && !createCommentMutation.isPending ? "#6366F1" : "#D1D5DB"}
                  />
                </Pressable>
              </View>
              {/* 评论列表：主评论 + 回复按钮 + 共 n 条回复 展开 */}
              <View style={styles.commentsList}>
                {!commentsData.comments.length ? (
                  <Text style={styles.noComments}>暂无评论，来发表第一条吧~</Text>
                ) : (
                  commentsData.comments.map((comment) => {
                    const votedPhoto = card.photos.find((p) => p.id === comment.votedPhotoId);
                    const photoIndex = votedPhoto
                      ? card.photos.findIndex((p) => p.id === comment.votedPhotoId)
                      : -1;
                    const replyCount = (comment as CommentWithVote & { replyCount?: number }).replyCount ?? 0;
                    const expanded = expandedReplies[comment.id];
                    const loading = loadingReplies[comment.id];
                    return (
                      <View key={comment.id} style={styles.commentBlock}>
                        <View style={styles.commentItem}>
                          <View style={styles.commentAvatarWrap}>
                            {votedPhoto ? (
                              <Image
                                source={{ uri: getImageUrl(votedPhoto.url) }}
                                style={styles.commentAvatarPhoto}
                                contentFit="cover"
                              />
                            ) : (
                              <View style={styles.commentAvatar}>
                                <Text style={styles.commentAvatarText}>{comment.userName.slice(-2)}</Text>
                              </View>
                            )}
                            {votedPhoto && photoIndex >= 0 && (
                              <View style={styles.photoNumBadge}>
                                <Text style={styles.photoNumText}>{photoIndex + 1}</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.commentBody}>
                            <View style={styles.commentRow}>
                              <Text style={styles.commentUser}>{comment.userName}</Text>
                              {votedPhoto && photoIndex >= 0 && (
                                <View style={styles.voteBadge}>
                                  <IconSymbol name="checkmark.circle.fill" size={12} color="#6366F1" />
                                  <Text style={styles.voteBadgeText}>第 {photoIndex + 1} 张</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.commentContent}>{comment.content}</Text>
                            <View style={styles.commentFooter}>
                              <Text style={styles.commentTime}>
                                {new Date(comment.createdAt).toLocaleString("zh-CN", {
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </Text>
                              <Pressable onPress={() => handleReplyClick(comment.id, comment.userName)} style={styles.replyBtn}>
                                <Text style={styles.replyBtnText}>回复</Text>
                              </Pressable>
                            </View>
                          </View>
                        </View>
                        {replyCount > 0 && (
                          <View style={styles.repliesToggleRow}>
                            {expanded ? (
                              <>
                                {expanded.replies.map((reply) => {
                                  const rPhoto = card.photos.find((p) => p.id === reply.votedPhotoId);
                                  const rIdx = rPhoto ? card.photos.findIndex((p) => p.id === reply.votedPhotoId) : -1;
                                  const rReplyCount = reply.replyCount ?? 0;
                                  const rExpanded = expandedReplies[reply.id];
                                  const rLoading = loadingReplies[reply.id];
                                  return (
                                    <View key={reply.id} style={styles.replyBlock}>
                                      <View style={[styles.commentItem, styles.replyItem]}>
                                        <View style={styles.commentBody}>
                                          <View style={styles.commentRow}>
                                            <Text style={styles.commentUser}>{reply.userName}</Text>
                                            {rPhoto && rIdx >= 0 && (
                                              <View style={styles.voteBadge}>
                                                <IconSymbol name="checkmark.circle.fill" size={12} color="#6366F1" />
                                                <Text style={styles.voteBadgeText}>第 {rIdx + 1} 张</Text>
                                              </View>
                                            )}
                                          </View>
                                          <Text style={styles.commentContent}>
                                            回复 @{expanded.parentUserName}: {reply.content}
                                          </Text>
                                          <View style={styles.commentFooter}>
                                            <Text style={styles.commentTime}>
                                              {new Date(reply.createdAt).toLocaleString("zh-CN", {
                                                month: "2-digit",
                                                day: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                              })}
                                            </Text>
                                            <Pressable onPress={() => handleReplyClick(reply.id, reply.userName)} style={styles.replyBtn}>
                                              <Text style={styles.replyBtnText}>回复</Text>
                                            </Pressable>
                                          </View>
                                        </View>
                                      </View>
                                      {rReplyCount > 0 && (
                                        <View style={styles.repliesToggleRow}>
                                          {rExpanded ? (
                                            <>
                                              {rExpanded.replies.map((sub) => (
                                                <View key={sub.id} style={[styles.commentItem, styles.replyItem, styles.replyItemL2]}>
                                                  <View style={styles.commentBody}>
                                                    <Text style={styles.commentContent}>
                                                      回复 @{rExpanded.parentUserName}: {sub.content}
                                                    </Text>
                                                    <View style={styles.commentFooter}>
                                                      <Text style={styles.commentTime}>
                                                        {new Date(sub.createdAt).toLocaleString("zh-CN", {
                                                          month: "2-digit",
                                                          day: "2-digit",
                                                          hour: "2-digit",
                                                          minute: "2-digit",
                                                        })}
                                                      </Text>
                                                      <Pressable onPress={() => handleReplyClick(sub.id, sub.userName)} style={styles.replyBtn}>
                                                        <Text style={styles.replyBtnText}>回复</Text>
                                                      </Pressable>
                                                    </View>
                                                  </View>
                                                </View>
                                              ))}
                                              <Pressable
                                                onPress={() => setExpandedReplies((p) => { const next = { ...p }; delete next[reply.id]; return next; })}
                                                style={styles.repliesToggleBtn}
                                              >
                                                <Text style={styles.repliesToggleText}>收起回复</Text>
                                              </Pressable>
                                            </>
                                          ) : (
                                            <Pressable
                                              onPress={() => !rLoading && handleExpandReplies(reply.id)}
                                              style={styles.repliesToggleBtn}
                                              disabled={rLoading}
                                            >
                                              {rLoading ? (
                                                <ActivityIndicator size="small" color="#6366F1" />
                                              ) : (
                                                <Text style={styles.repliesToggleText}>共 {rReplyCount} 条回复</Text>
                                              )}
                                            </Pressable>
                                          )}
                                        </View>
                                      )}
                                    </View>
                                  );
                                })}
                                <Pressable
                                  onPress={() => setExpandedReplies((p) => { const next = { ...p }; delete next[comment.id]; return next; })}
                                  style={styles.repliesToggleBtn}
                                >
                                  <Text style={styles.repliesToggleText}>收起回复</Text>
                                </Pressable>
                              </>
                            ) : (
                              <Pressable
                                onPress={() => !loading && handleExpandReplies(comment.id)}
                                style={styles.repliesToggleBtn}
                                disabled={loading}
                              >
                                {loading ? (
                                  <ActivityIndicator size="small" color="#6366F1" />
                                ) : (
                                  <Text style={styles.repliesToggleText}>共 {replyCount} 条回复</Text>
                                )}
                              </Pressable>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </KeyboardAvoidingView>
          ) : (
            <Text style={styles.commentsHint}>参与投票后可查看和发表评论</Text>
          )}
        </View>

        </ScrollView>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <Pressable
            onPress={handleToggleFavorite}
            disabled={toggleFavoriteMutation.isPending}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.favBtn,
                  isFavorited ? styles.favBtnActive : styles.favBtnInactive,
                  pressed && styles.favBtnPressed,
                  toggleFavoriteMutation.isPending && styles.favBtnLoading,
                ]}
              >
                {toggleFavoriteMutation.isPending ? (
                  <ActivityIndicator color={isFavorited ? "#ffffff" : "#6366F1"} size="small" />
                ) : (
                  <>
                    <IconSymbol
                      name={isFavorited ? "heart.fill" : "heart"}
                      size={20}
                      color={isFavorited ? "#ffffff" : "#6366F1"}
                    />
                    <Text style={[styles.favBtnText, isFavorited ? styles.favBtnTextActive : styles.favBtnTextInactive]}>
                      {isFavorited ? "已收藏" : "收藏"}
                    </Text>
                  </>
                )}
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
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
  loadingText: {
    fontSize: 16,
    color: "#687076",
  },
  cardCopyContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#11181C",
  },
  cardDescription: {
    fontSize: 14,
    color: "#687076",
    lineHeight: 20,
  },
  resultsContainer: {
    gap: 16,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  rankText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#687076",
  },
  photoWrapper: {
    position: "relative",
  },
  resultPhoto: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  winnerBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
  },
  winnerText: {
    fontSize: 14,
  },
  statsContainer: {
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  percentageText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#11181C",
  },
  uploadOrderText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  voteCountText: {
    fontSize: 14,
    color: "#687076",
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#9CA3AF",
    borderRadius: 4,
  },
  progressWinner: {
    backgroundColor: "#6366F1",
  },
  summaryContainer: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 14,
    color: "#687076",
  },
  actionsContainer: {
    alignItems: "stretch",
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
  },
  favBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: 32,
  },
  favBtnActive: {
    backgroundColor: "#F59E0B",
    shadowColor: "#B45309",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  favBtnInactive: {
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#6366F1",
  },
  favBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  favBtnLoading: {
    opacity: 0.6,
  },
  favBtnText: {
    fontSize: 16,
    fontWeight: "700",
  },
  favBtnTextActive: {
    color: "#ffffff",
  },
  favBtnTextInactive: {
    color: "#6366F1",
  },
  commentsSection: {
    marginTop: 24,
    marginBottom: 8,
  },
  commentsSectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#11181C",
    marginBottom: 12,
  },
  commentsBlock: {
    gap: 12,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    fontSize: 15,
    color: "#11181C",
    paddingVertical: 8,
  },
  commentSendBtn: {
    padding: 8,
  },
  commentSendBtnDisabled: {
    opacity: 0.5,
  },
  replyPrefixRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  replyPrefixText: {
    fontSize: 13,
    color: "#6366F1",
  },
  commentsList: {
    gap: 12,
  },
  commentBlock: {
    gap: 4,
  },
  noComments: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingVertical: 16,
  },
  commentsHint: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    paddingVertical: 12,
  },
  commentItem: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
  },
  commentAvatarWrap: {
    position: "relative",
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  commentAvatarText: {
    fontSize: 12,
    color: "#687076",
    fontWeight: "600",
  },
  commentAvatarPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  photoNumBadge: {
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
  photoNumText: {
    fontSize: 10,
    color: "#ffffff",
    fontWeight: "bold",
  },
  commentBody: {
    flex: 1,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  commentUser: {
    fontSize: 14,
    fontWeight: "600",
    color: "#11181C",
  },
  voteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  voteBadgeText: {
    fontSize: 12,
    color: "#6366F1",
    fontWeight: "500",
  },
  commentContent: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    marginBottom: 4,
  },
  commentFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  commentTime: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  replyBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  replyBtnText: {
    fontSize: 13,
    color: "#6366F1",
  },
  replyItem: {
    marginLeft: 24,
    backgroundColor: "#F3F4F6",
  },
  replyItemL2: {
    marginLeft: 36,
    backgroundColor: "#E5E7EB",
  },
  replyBlock: {
    gap: 4,
  },
  repliesToggleRow: {
    marginTop: 4,
    marginLeft: 12,
    gap: 4,
  },
  repliesToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  repliesToggleText: {
    fontSize: 13,
    color: "#6366F1",
  },
});
