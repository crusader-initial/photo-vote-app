import { View, Text, Pressable, StyleSheet, Modal, FlatList, Platform, Alert } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useDeviceId } from "@/hooks/use-device-id";
import { trpc } from "@/lib/trpc";
import { getImageUrl } from "@/lib/utils";
import * as Haptics from "expo-haptics";

interface HistoryDrawerProps {
  visible: boolean;
  onClose: () => void;
}

export function HistoryDrawer({ visible, onClose }: HistoryDrawerProps) {
  const router = useRouter();
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
      <View style={styles.cardItem}>
        <Pressable
          onPress={() => handleCardPress(item.id, item.isCompleted)}
          style={({ pressed }) => [
            styles.cardMain,
            pressed && styles.cardItemPressed,
          ]}
        >
          <View style={styles.cardThumbnail}>
            {firstPhoto && (
              <Image
                source={{ uri: getImageUrl(firstPhoto.url) }}
                style={styles.thumbnail}
                contentFit="cover"
              />
            )}
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>
              {item.photos?.length ?? 0} 张照片
            </Text>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${progress}%` }]}
                />
              </View>
              <Text style={styles.progressText}>
                {item.totalVotes}/10 票
              </Text>
            </View>
            <View style={[
              styles.statusBadge,
              item.isCompleted ? styles.statusCompleted : styles.statusPending
            ]}>
              <Text style={[
                styles.statusText,
                item.isCompleted ? styles.statusTextCompleted : styles.statusTextPending
              ]}>
                {item.isCompleted ? "已完成" : "进行中"}
              </Text>
            </View>
          </View>
          <IconSymbol name="chevron.right" size={20} color="#9CA3AF" />
        </Pressable>
        <Pressable
          onPress={() => handleDelete(item.id)}
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.deleteButtonPressed,
          ]}
          hitSlop={8}
          accessibilityLabel="删除该卡片"
        >
          <IconSymbol name="trash.fill" size={22} color="#EF4444" />
          <Text style={styles.deleteLabel}>删除</Text>
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
        <View style={styles.drawer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>我的上传</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <IconSymbol name="xmark" size={24} color="#11181C" />
            </Pressable>
          </View>

          {/* Content */}
          {isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>加载中...</Text>
            </View>
          ) : !myCards || myCards.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>暂无上传记录</Text>
              <Text style={styles.emptyText}>上传照片后可在这里查看</Text>
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
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    minHeight: 300,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#11181C",
  },
  closeButton: {
    padding: 4,
  },
  listContent: {
    padding: 16,
  },
  cardItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  cardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    backgroundColor: "#E5E7EB",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#11181C",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#6366F1",
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
    backgroundColor: "#DCFCE7",
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  statusTextCompleted: {
    color: "#166534",
  },
  statusTextPending: {
    color: "#92400E",
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
    color: "#11181C",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#687076",
  },
});
