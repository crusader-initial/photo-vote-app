import { useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Haptics from "expo-haptics";

type FeedbackType = "bug" | "suggestion" | "other";

const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: string; bg: string; color: string }[] = [
  { value: "bug", label: "问题反馈", icon: "exclamationmark.bubble.fill", bg: "#FEE2E2", color: "#EF4444" },
  { value: "suggestion", label: "功能建议", icon: "lightbulb.fill", bg: "#FEF9C3", color: "#EAB308" },
  { value: "other", label: "其他", icon: "ellipsis.bubble.fill", bg: "#E0E7FF", color: "#6366F1" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function FeedbackModal({ visible, onClose }: Props) {
  const colors = useColors();
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [content, setContent] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  /** Screenshot as base64 data URL (data:image/xxx;base64,...) */
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = trpc.feedbacks.submit.useMutation();

  const haptic = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleClose = () => {
    if (submitMutation.isPending) return;
    onClose();
    setTimeout(() => {
      setContent("");
      setContactInfo("");
      setScreenshot(null);
      setType("suggestion");
      setSubmitted(false);
    }, 300);
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert("请填写反馈内容");
      return;
    }
    haptic();
    try {
      await submitMutation.mutateAsync({
        type,
        content: content.trim(),
        contactInfo: contactInfo.trim() || undefined,
        screenshot: screenshot ?? undefined,
      });
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert("提交失败", e?.message ?? "请稍后重试");
    }
  };

  const selectedType = FEEDBACK_TYPES.find((t) => t.value === type)!;

  const pickScreenshot = async () => {
    haptic();
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("需要权限", "请允许访问相册以上传截图");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 10],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const asset = result.assets[0];
      const mime = asset.mimeType ?? "image/jpeg";
      setScreenshot(`data:${mime};base64,${asset.base64}`);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[styles.sheetInner, { backgroundColor: colors.background }]}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>意见反馈</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <IconSymbol name="xmark.circle.fill" size={24} color={colors.muted} />
            </Pressable>
          </View>

          {submitted ? (
            <View style={styles.successWrap}>
              <View style={[styles.successIcon, { backgroundColor: "#DCFCE7" }]}>
                <IconSymbol name="checkmark.circle.fill" size={40} color="#22C55E" />
              </View>
              <Text style={[styles.successTitle, { color: colors.text }]}>感谢您的反馈！</Text>
              <Text style={[styles.successSub, { color: colors.muted }]}>
                我们会认真阅读每一条建议，持续改进产品体验
              </Text>
              <Pressable onPress={handleClose} style={[styles.doneBtn, { backgroundColor: colors.tint }]}>
                <Text style={styles.doneBtnText}>完成</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.body}
            >
              {/* Type selector */}
              <Text style={[styles.label, { color: colors.muted }]}>反馈类型</Text>
              <View style={styles.typeRow}>
                {FEEDBACK_TYPES.map((t) => {
                  const active = type === t.value;
                  return (
                    <Pressable
                      key={t.value}
                      onPress={() => { haptic(); setType(t.value); }}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: active ? t.bg : colors.surface,
                          borderColor: active ? t.color : colors.border,
                        },
                      ]}
                    >
                      <IconSymbol name={t.icon as any} size={16} color={active ? t.color : colors.muted} />
                      <Text style={[styles.typeChipText, { color: active ? t.color : colors.muted }]}>
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Content */}
              <Text style={[styles.label, { color: colors.muted }]}>反馈内容</Text>
              <TextInput
                style={[
                  styles.textarea,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder={
                  type === "bug"
                    ? "请描述遇到的问题，包括操作步骤和异常现象…"
                    : type === "suggestion"
                    ? "请描述您希望改进或新增的功能…"
                    : "请填写您的意见或建议…"
                }
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={5}
                maxLength={2000}
                value={content}
                onChangeText={setContent}
                textAlignVertical="top"
              />
              <Text style={[styles.charCount, { color: colors.muted }]}>{content.length} / 2000</Text>

              {/* Screenshot upload */}
              <Text style={[styles.label, { color: colors.muted }]}>截图（选填）</Text>
              {screenshot ? (
                <View style={styles.screenshotWrap}>
                  <Image source={{ uri: screenshot }} style={styles.screenshotPreview} contentFit="cover" />
                  <Pressable
                    onPress={() => { haptic(); setScreenshot(null); }}
                    style={[styles.screenshotRemove, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <IconSymbol name="xmark.circle.fill" size={20} color={colors.muted} />
                    <Text style={[styles.screenshotRemoveText, { color: colors.muted }]}>移除</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={pickScreenshot}
                  style={[styles.screenshotBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <IconSymbol name="photo.on.rectangle.angled" size={22} color={colors.muted} />
                  <Text style={[styles.screenshotBtnText, { color: colors.muted }]}>上传截图</Text>
                </Pressable>
              )}

              {/* Contact info */}
              <Text style={[styles.label, { color: colors.muted }]}>联系方式（选填）</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder="邮箱或手机号，方便我们回复您"
                placeholderTextColor={colors.muted}
                value={contactInfo}
                onChangeText={setContactInfo}
                maxLength={255}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              {/* Submit */}
              <Pressable
                onPress={handleSubmit}
                disabled={submitMutation.isPending || !content.trim()}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.submitBtn,
                      { backgroundColor: selectedType.color },
                      pressed && { opacity: 0.85 },
                      (submitMutation.isPending || !content.trim()) && styles.submitDisabled,
                    ]}
                  >
                    {submitMutation.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.submitBtnText}>提交反馈</Text>
                    )}
                  </View>
                )}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetInner: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 8,
    marginBottom: 4,
  },
  typeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  typeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    minHeight: 110,
    lineHeight: 22,
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  submitBtn: {
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  successWrap: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 32,
    gap: 12,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  successSub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  doneBtn: {
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 48,
    marginTop: 8,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
