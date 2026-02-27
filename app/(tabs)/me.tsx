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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenContainer } from "@/components/screen-container";
import { HistoryDrawer } from "@/components/history-drawer";
import { FeedbackModal } from "@/components/feedback-modal";
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

const OVERLAY_DARK = "rgba(0,0,0,0.68)";

type CropModalProps = {
  asset: ImagePicker.ImagePickerAsset;
  tintColor: string;
  onConfirm: (base64: string, mimeType: string) => void;
  onCancel: () => void;
};

function AvatarCropModal({ asset, tintColor, onConfirm, onCancel }: CropModalProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const circleR = Math.min(screenW * 0.38, 160);
  const circleD = circleR * 2;
  const circleCX = screenW / 2;
  const circleCY = screenH * 0.42;

  // Scale image to at least cover the circle while maintaining aspect ratio
  const displayScale = Math.max(
    screenW / asset.width,
    circleD / asset.height,
    circleD / asset.width,
  );
  const dW = asset.width * displayScale;
  const dH = asset.height * displayScale;

  // Shared values: translation is relative to the image's centered position
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  // Saved state between gesture sessions
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);
  const savedScale = useSharedValue(1);

  const [confirming, setConfirming] = useState(false);

  // Minimum scale: image must just cover the circle (can be < 1 if displayScale overshoots)
  const MIN_SCALE = Math.max(circleD / dW, circleD / dH);
  const MAX_SCALE = 6;

  // RNGH v2 + Reanimated v4: callbacks auto-workletize when they access shared values.
  // Do NOT add explicit "worklet" directive — it breaks pinch in arrow functions.
  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedTX.value = translateX.value;
      savedTY.value = translateY.value;
    })
    .onUpdate((e) => {
      const s = scale.value;
      const halfW = (dW * s) / 2;
      const halfH = (dH * s) / 2;
      const nx = savedTX.value + e.translationX;
      const ny = savedTY.value + e.translationY;
      translateX.value = Math.min(Math.max(nx, -(halfW - circleR)), halfW - circleR);
      translateY.value = Math.min(Math.max(ny, -(halfH - circleR)), halfH - circleR);
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      const newScale = Math.min(Math.max(savedScale.value * e.scale, MIN_SCALE), MAX_SCALE);
      scale.value = newScale;
      const halfW = (dW * newScale) / 2;
      const halfH = (dH * newScale) / 2;
      translateX.value = Math.min(Math.max(translateX.value, -(halfW - circleR)), halfW - circleR);
      translateY.value = Math.min(Math.max(translateY.value, -(halfH - circleR)), halfH - circleR);
    })
    .onEnd(() => {
      const s = scale.value;
      const halfW = (dW * s) / 2;
      const halfH = (dH * s) / 2;
      translateX.value = withSpring(Math.min(Math.max(translateX.value, -(halfW - circleR)), halfW - circleR));
      translateY.value = withSpring(Math.min(Math.max(translateY.value, -(halfH - circleR)), halfH - circleR));
    });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const tx = translateX.value;
      const ty = translateY.value;
      const s = scale.value;
      // Image top-left on screen = (circleCX - dW/2*s + tx, circleCY - dH/2*s + ty)
      // Circle top-left on screen = (circleCX - circleR, circleCY - circleR)
      // Crop offset in screen pixels:
      const cropScreenX = (circleCX - circleR) - (circleCX - dW / 2 * s + tx);
      const cropScreenY = (circleCY - circleR) - (circleCY - dH / 2 * s + ty);
      // Convert to original image coordinates
      const totalScale = displayScale * s;
      const cropX = cropScreenX / totalScale;
      const cropY = cropScreenY / totalScale;
      const cropSize = circleD / totalScale;

      const safeX = Math.max(0, Math.round(cropX));
      const safeY = Math.max(0, Math.round(cropY));
      const safeSize = Math.round(
        Math.min(cropSize, asset.width - safeX, asset.height - safeY),
      );

      const result = await ImageManipulator.manipulateAsync(
        asset.uri,
        [
          { crop: { originX: safeX, originY: safeY, width: safeSize, height: safeSize } },
          { resize: { width: 400, height: 400 } },
        ],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      if (result.base64) {
        onConfirm(result.base64, "image/jpeg");
      } else {
        throw new Error("裁剪结果异常");
      }
    } catch (e: any) {
      Alert.alert("裁剪失败", e?.message ?? "请重试");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      {/* GestureHandlerRootView is required inside Modal (separate render tree) */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>

        {/* Gesture layer: full screen pan + pinch */}
        <GestureDetector gesture={composed}>
          <View style={StyleSheet.absoluteFill}>
            {/* Image centered at (circleCX, circleCY) */}
            <Animated.View
              style={[{
                position: "absolute",
                top: circleCY - dH / 2,
                left: circleCX - dW / 2,
                width: dW,
                height: dH,
              }, animatedStyle]}
            >
              <Image
                source={{ uri: asset.uri }}
                style={{ width: dW, height: dH }}
                contentFit="fill"
              />
            </Animated.View>
          </View>
        </GestureDetector>

        {/* Dark overlay panels forming circular hole — pointer-events none so gestures pass through */}
        <View pointerEvents="none" style={[cropStyles.overlayPanel, { top: 0, left: 0, right: 0, height: circleCY - circleR }]} />
        <View pointerEvents="none" style={[cropStyles.overlayPanel, { top: circleCY + circleR, left: 0, right: 0, bottom: 0 }]} />
        <View pointerEvents="none" style={[cropStyles.overlayPanel, { top: circleCY - circleR, left: 0, width: circleCX - circleR, height: circleD }]} />
        <View pointerEvents="none" style={[cropStyles.overlayPanel, { top: circleCY - circleR, left: circleCX + circleR, right: 0, height: circleD }]} />

        {/* Circle border ring */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: circleCY - circleR,
            left: circleCX - circleR,
            width: circleD,
            height: circleD,
            borderRadius: circleR,
            borderWidth: 2.5,
            borderColor: "#fff",
          }}
        />

        {/* Top bar */}
        <View pointerEvents="none" style={cropStyles.topBar}>
          <Text style={cropStyles.topTitle}>更换头像</Text>
        </View>

        {/* Hint below circle */}
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: circleCY + circleR + 18, left: 0, right: 0, alignItems: "center" }}
        >
          <Text style={cropStyles.hintText}>双指缩放 · 拖动调整位置</Text>
        </View>

        {/* Action buttons */}
        <View style={cropStyles.btnRow}>
          <Pressable onPress={onCancel} disabled={confirming} style={{ flex: 1 }}>
            {({ pressed }) => (
              <View style={[cropStyles.cancelBtn, pressed && { opacity: 0.7 }]}>
                <Text style={cropStyles.cancelBtnText}>取消</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={handleConfirm} disabled={confirming} style={{ flex: 2 }}>
            {({ pressed }) => (
              <View style={[cropStyles.confirmBtn, { backgroundColor: tintColor }, pressed && { opacity: 0.85 }, confirming && { opacity: 0.7 }]}>
                {confirming ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={cropStyles.confirmBtnText}>使用此头像</Text>
                )}
              </View>
            )}
          </Pressable>
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const cropStyles = StyleSheet.create({
  overlayPanel: {
    position: "absolute",
    backgroundColor: OVERLAY_DARK,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingBottom: 16,
    alignItems: "center",
  },
  topTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  hintText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
  },
  btnRow: {
    position: "absolute",
    bottom: 48,
    left: 24,
    right: 24,
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
  },
  cancelBtnText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    fontWeight: "600",
  },
  confirmBtn: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

// ─────────────────────────────────────────────────────────────────────────────

export default function MeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, refresh, logout, loading: authLoading } = useAuth();
  const [showHistory, setShowHistory] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deregistering, setDeregistering] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const updateAvatarMutation = trpc.users.updateAvatar.useMutation();
  const deregisterMutation = trpc.auth.deregister.useMutation();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const { data: myCards } = trpc.cards.getMyCards.useQuery(
    undefined,
    { enabled: !!user }
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

  const handleFeedbackPress = () => {
    haptic();
    setShowFeedback(true);
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
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setPendingAsset(result.assets[0]);
  };

  const handleConfirmAvatar = async (base64: string, mimeType: string) => {
    if (!user) return;
    setPendingAsset(null);
    setUploadingAvatar(true);
    try {
      const { avatarUrl } = await updateAvatarMutation.mutateAsync({ base64, mimeType });
      const updatedUser: Auth.User = { ...user, avatarUrl };
      await Auth.setUserInfo(updatedUser);
      await refresh();
    } catch (e: any) {
      Alert.alert("上传失败", e?.message ?? "头像更换失败，请重试");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = () => {
    haptic();
    Alert.alert(
      "退出登录",
      "确定要退出登录吗？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "退出",
          style: "destructive",
          onPress: async () => {
            setLoggingOut(true);
            try {
              await logout();
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  };

  const handleDeregister = () => {
    haptic();
    Alert.alert(
      "注销账号",
      "注销后账号及所有数据将被永久删除，无法恢复，确定继续吗？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认注销",
          style: "destructive",
          onPress: async () => {
            setDeregistering(true);
            try {
              await deregisterMutation.mutateAsync();
              await logout();
            } catch (e: any) {
              Alert.alert("注销失败", e?.message ?? "请稍后重试");
            } finally {
              setDeregistering(false);
            }
          },
        },
      ],
    );
  };

  if (authLoading) {
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
                <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.55 }] }} />
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

          <Pressable onPress={handleFeedbackPress}>
            {({ pressed }) => (
              <View
                style={[
                  styles.menuRow,
                  styles.cardShadow,
                  { backgroundColor: colors.background, borderColor: colors.border },
                  pressed && styles.menuRowPressed,
                ]}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: "#FEF9C3" }]}>
                  <IconSymbol name="lightbulb.fill" size={20} color="#EAB308" />
                </View>
                <Text style={[styles.menuLabel, { color: colors.text }]}>意见反馈</Text>
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

        <Pressable onPress={handleDeregister} disabled={deregistering} style={styles.deregisterWrap}>
          {({ pressed }) => (
            <Text style={[styles.deregisterText, pressed && { opacity: 0.5 }, deregistering && { opacity: 0.4 }]}>
              {deregistering ? "注销中…" : "注销账号"}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      <HistoryDrawer visible={showHistory} onClose={() => setShowHistory(false)} />
      <FeedbackModal visible={showFeedback} onClose={() => setShowFeedback(false)} />

      {pendingAsset && (
        <AvatarCropModal
          asset={pendingAsset}
          tintColor={colors.tint}
          onConfirm={handleConfirmAvatar}
          onCancel={() => setPendingAsset(null)}
        />
      )}
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
  deregisterWrap: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  deregisterText: {
    fontSize: 13,
    color: "#EF4444",
    textDecorationLine: "underline",
  },
  cardShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
