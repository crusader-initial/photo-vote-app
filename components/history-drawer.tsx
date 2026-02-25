import { View, Text, Pressable, StyleSheet, Modal, FlatList, Platform, Alert } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useDeviceId } from "@/hooks/use-device-id";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getImageUrl } from "@/lib/utils";
import * as Haptics from "expo-haptics";

interface HistoryDrawerProps {
  visible: boolean;
  onClose: () => void;
}

export function HistoryDrawer({ visible, onClose }: HistoryDrawerProps) {
  const router = useRouter();
  const colors = useColors();
  const { deviceId } = useDeviceId();

  const utils = trpc.useUtils();
  const { data: myCards, isLoading } = trpc.cards.getMyCards.useQuery(
    { deviceId: deviceId ?? "" },
    { enabled: !!deviceId && visible }
  );

  const deleteCardMutation = trpc.cards.delete.useMutation({
    onSuccess: () => {
      utils.cards.getMyCards.invalidate();
    },
    onError: (err) => {
      Alert.alert("删除失败", err.message);
    },
  });

  const handleDelete = (cardId: number) => {
    Alert.alert(
      "删除上传",
      "确定要删除这张投票卡吗？删除后无法恢复。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => {
            if (!deviceId) return;
            deleteCardMutation.mutate({ cardId, deviceId });
          },
        },
      ]
    );
  };

  const handleCardPress = (cardId: number, isCompleted: boolean) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onClose();
    if (isCompleted) {
      router.push(`/result?cardId=${cardId}`);
    } else {
      router.push(`/waiting?cardId=${cardId}`);
    }
  };

  const renderCard = ({ item }: { item: any }) => {
    const firstPhoto = item.photos?.[0];
    const progress = Math.round((item.totalVotes / 10) * 100);

    return (
      <View style={[styles.cardItem, styles.cardShadow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable
          onPress={() => handleCardPress(item.id, item.isCompleted)}
          style={styles.cardMainPressable}
        >
          {({ pressed }) => (
            <View style={[styles.cardMain, pressed && styles.cardItemPressed]}>
              <View style={[styles.cardThumbnail, { backgroundColor: colors.border }]}>
                {firstPhoto && (
                  <Image
                    source={{ uri: getImageUrl(firstPhoto.url) }}
                    style={styles.thumbnail}
                    contentFit="cover"
                  />
                )}
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {item.photos?.length ?? 0} 张照片
                </Text>
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                    <View
                      style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.tint }]}
                    />
                  </View>
                  <Text style={[styles.progressText, { color: colors.muted }]}>
                    {item.totalVotes}/10 票
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  item.isCompleted ? styles.statusCompleted : styles.statusPending,
                  { backgroundColor: item.isCompleted ? "rgba(34, 197, 94, 0.12)" : "rgba(99, 102, 241, 0.12)" }
                ]}>
                  <Text style={[
                    styles.statusText,
                    item.isCompleted ? styles.statusTextCompleted : styles.statusTextPending,
                    { color: item.isCompleted ? colors.success : colors.tint }
                  ]}>
                    {item.isCompleted ? "已完成" : "进行中"}
                  </Text>
                </View>
              </View>
              <IconSymbol name="chevron.right" size={20} color={colors.muted} />
            </View>
          )}
        </Pressable>
        <Pressable onPress={() => handleDelete(item.id)} hitSlop={8} accessibilityLabel="删除该卡片">
          {({ pressed }) => (
            <View style={[styles.deleteButton, pressed && styles.deleteButtonPressed]}>
              <IconSymbol name="trash.fill" size={22} color="#EF4444" />
              <Text style={styles.deleteLabel}>删除</Text>
            </View>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.overlayBackground} onPress={onClose} />
        <View style={[styles.drawer, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>我的发布</Text>
              <Pressable
                onPress={onClose}
                style={[styles.closeButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <IconSymbol name="xmark" size={20} color={colors.text} />
              </Pressable>
            </View>
          </View>

          {/* Content */}
          {isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>加载中...</Text>
            </View>
          ) : !myCards || myCards.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>暂无发布记录</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>上传照片后可在这里查看</Text>
            </View>
          ) : (
            <FlatList
              data={myCards}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderCard}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  drawer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    minHeight: 300,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(120, 120, 120, 0.3)",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    alignItems: "stretch",
  },
  cardItem: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    gap: 8,
    width: "100%",
  },
  cardMainPressable: {
    flex: 1,
  },
  cardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  cardItemPressed: {
    opacity: 0.8,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
    flexShrink: 0,
    alignSelf: "center",
  },
  deleteButtonPressed: {
    opacity: 0.7,
  },
  deleteLabel: {
    fontSize: 14,
    color: "#EF4444",
    fontWeight: "500",
  },
  cardThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: "hidden",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  cardInfo: {
    flex: 1,
    gap: 4,
    minWidth: 0,
    flexShrink: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#11181C",
    flexShrink: 1,
    minWidth: 0,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: "#687076",
    width: 60,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusCompleted: {
  },
  statusPending: {
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  statusTextCompleted: {
  },
  statusTextPending: {
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
  },
  cardShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
