import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenContainer } from "@/components/screen-container";
import { HistoryDrawer } from "@/components/history-drawer";
import { useDeviceId } from "@/hooks/use-device-id";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Auth from "@/lib/_core/auth";

function maskPhone(phone: string | null): string {
  if (!phone || phone.length < 11) return "用户";
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
}

function displayName(user: { name: string | null; phone: string | null }): string {
  if (user.name?.trim()) return user.name.trim();
  return maskPhone(user.phone);
}

export default function MeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const { deviceId, loading: deviceLoading } = useDeviceId();
  const { user, refresh, logout } = useAuth();
  const [showHistory, setShowHistory] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const updateAvatarMutation = trpc.users.updateAvatar.useMutation();
  const previewSize = Math.min(screenWidth * 0.6, 240);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const { data: myCards } = trpc.cards.getMyCards.useQuery(
    { deviceId: deviceId ?? "" },
    { enabled: !!deviceId && !!user }
  );
  const pendingCards = myCards?.filter((c) => !c.isCompleted).length ?? 0;

  const haptic = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLoginPress = () => {
    haptic();
    router.push("/login");
  };

  const handleFavoritesPress = () => {
    haptic();
    router.push("/favorites");
  };

  const handleMyPublishPress = () => {
    haptic();
    setShowHistory(true);
  };

  const handleAvatarPress = async () => {
    if (!user) return;
    haptic();

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("需要权限", "请允许访问相册以更换头像");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;
    setPendingAsset(result.assets[0]);
  };

  const handleConfirmAvatar = async () => {
    if (!user || !pendingAsset?.base64) return;
    haptic();
    const mimeType = pendingAsset.mimeType ?? "image/jpeg";
    setUploadingAvatar(true);
    setPendingAsset(null);
    try {
      const { avatarUrl } = await updateAvatarMutation.mutateAsync({
        base64: pendingAsset.base64,
        mimeType,
      });
      const updatedUser: Auth.User = { ...user, avatarUrl };
      await Auth.setUserInfo(updatedUser);
      await refresh();
    } catch (e: any) {
      Alert.alert("上传失败", e?.message || "头像更换失败，请重试");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = async () => {
    haptic();
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  if (deviceLoading) {
    return (
      <ScreenContainer
        className="flex-1 items-center justify-center"
        style={[styles.fill, { backgroundColor: colors.surface }]}
      >
        <ActivityIndicator size="large" color={colors.tint} />
      </ScreenContainer>
    );
  }

  if (!user) {
    return (
      <ScreenContainer
        className="flex-1"
        style={[styles.fill, { backgroundColor: colors.surface }]}
      >
        <View style={styles.guestWrap}>
          <View
            style={[
              styles.guestCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={[styles.guestAvatar, { backgroundColor: colors.surface }]}>
              <IconSymbol name="person.fill" size={36} color={colors.icon} />
            </View>
            <Text style={[styles.guestTitle, { color: colors.text }]}>登录后使用更多功能</Text>
            <Text style={[styles.guestSubtitle, { color: colors.muted }]}>同步收藏、管理发布</Text>
            <Pressable onPress={handleLoginPress}>
              {({ pressed }) => (
                <View
                  style={[
                    styles.primaryButton,
                    { backgroundColor: colors.tint },
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>去登录</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      className="flex-1"
      style={[styles.fill, { backgroundColor: colors.surface }]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.profileCard,
            styles.cardShadow,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Pressable onPress={handleAvatarPress} style={styles.avatarWrap} disabled={uploadingAvatar}>
            {user.avatarUrl ? (
              <Image
                source={{ uri: user.avatarUrl }}
                style={styles.avatarImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
                <Text style={styles.avatarText}>
                  {displayName(user).charAt(0).toUpperCase() || "我"}
                </Text>
              </View>
            )}
            <View style={[styles.avatarEditBadge, { backgroundColor: colors.tint }]}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.6 }] }} />
              ) : (
                <IconSymbol name="camera.fill" size={10} color="#fff" />
              )}
            </View>
          </Pressable>
          <View style={styles.profileText}>
            <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
              {displayName(user)}
            </Text>
            <Text style={[styles.profileSub, { color: colors.muted }]}>同步收藏与发布记录</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Pressable onPress={handleFavoritesPress}>
            {({ pressed }) => (
              <View
                style={[
                  styles.menuRow,
                  styles.cardShadow,
                  { backgroundColor: colors.background, borderColor: colors.border },
                  pressed && styles.menuRowPressed,
                ]}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: "#FEE2E2" }]}>
                  <IconSymbol name="heart.fill" size={20} color="#EF4444" />
                </View>
                <Text style={[styles.menuLabel, { color: colors.text }]}>我的收藏</Text>
                <IconSymbol name="chevron.right" size={18} color={colors.muted} />
              </View>
            )}
          </Pressable>

          <Pressable onPress={handleMyPublishPress}>
            {({ pressed }) => (
              <View
                style={[
                  styles.menuRow,
                  styles.cardShadow,
                  { backgroundColor: colors.background, borderColor: colors.border },
                  pressed && styles.menuRowPressed,
                ]}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: "#E0E7FF" }]}>
                  <IconSymbol name="photo.fill" size={20} color={colors.tint} />
                </View>
                <Text style={[styles.menuLabel, { color: colors.text }]}>我的发布</Text>
                {pendingCards > 0 && (
                  <View style={[styles.badge, { backgroundColor: colors.tint }]}>
                    <Text style={styles.badgeText}>{pendingCards}</Text>
                  </View>
                )}
                <IconSymbol name="chevron.right" size={18} color={colors.muted} />
              </View>
            )}
          </Pressable>
        </View>

        <Pressable onPress={handleLogout} disabled={loggingOut}>
          {({ pressed }) => (
            <View
              style={[
                styles.logoutRow,
                styles.cardShadow,
                { backgroundColor: colors.background, borderColor: colors.border },
                pressed && styles.menuRowPressed,
                loggingOut && styles.logoutDisabled,
              ]}
            >
              {loggingOut ? (
                <ActivityIndicator size="small" color={colors.muted} />
              ) : (
                <View style={[styles.logoutIconWrap, { backgroundColor: colors.surface }]}>
                  <IconSymbol name="rectangle.portrait.and.arrow.right" size={18} color={colors.muted} />
                </View>
              )}
              <Text style={[styles.logoutText, { color: colors.muted }]}>退出登录</Text>
            </View>
          )}
        </Pressable>
      </ScrollView>

      <HistoryDrawer visible={showHistory} onClose={() => setShowHistory(false)} />

      {/* Avatar preview modal */}
      <Modal
        visible={!!pendingAsset}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingAsset(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>更换头像</Text>
            <Text style={[styles.modalSub, { color: colors.muted }]}>将使用以下图片作为头像</Text>

            {/* Circular preview */}
            <View style={[styles.previewRing, { borderColor: colors.tint, width: previewSize + 8, height: previewSize + 8, borderRadius: (previewSize + 8) / 2 }]}>
              {pendingAsset && (
                <Image
                  source={{ uri: pendingAsset.uri }}
                  style={{ width: previewSize, height: previewSize, borderRadius: previewSize / 2 }}
                  contentFit="cover"
                />
              )}
            </View>

            {/* Action buttons */}
            <Pressable onPress={handleConfirmAvatar}>
              {({ pressed }) => (
                <View style={[styles.confirmBtn, { backgroundColor: colors.tint }, pressed && styles.btnPressed]}>
                  <IconSymbol name="checkmark" size={16} color="#fff" />
                  <Text style={styles.confirmBtnText}>使用此头像</Text>
                </View>
              )}
            </Pressable>

            <Pressable onPress={() => setPendingAsset(null)}>
              {({ pressed }) => (
                <View style={[styles.cancelBtn, { borderColor: colors.border }, pressed && styles.btnPressed]}>
                  <Text style={[styles.cancelBtnText, { color: colors.muted }]}>取消</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: "stretch",
    width: "100%",
  },
  guestWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  guestCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  guestAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  guestTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  guestSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  buttonPressed: {
    opacity: 0.9,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 18,
    width: "100%",
  },
  avatarWrap: {
    position: "relative",
    width: 56,
    height: 56,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "600",
    color: "#fff",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "600",
  },
  profileSub: {
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    gap: 10,
    marginBottom: 18,
    width: "100%",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    width: "100%",
  },
  menuRowPressed: {
    opacity: 0.85,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  badge: {
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  logoutIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "500",
  },
  logoutDisabled: {
    opacity: 0.6,
  },
  cardShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  modalSub: {
    fontSize: 13,
    marginTop: -8,
  },
  previewRing: {
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 999,
    marginTop: 4,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  cancelBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "500",
  },
  btnPressed: {
    opacity: 0.8,
  },
});
