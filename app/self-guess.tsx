import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
  Image as RNImage,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton } from "@/components/action-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import { getTempPhotos, clearTempPhotos } from "@/lib/temp-photos-store";

const TEMP_PHOTOS_KEY = "@temp_photos";

interface PhotoData {
  uri: string;
  base64: string;
  mimeType: string;
}

export default function SelfGuessScreen() {
  const router = useRouter();
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const createCardMutation = trpc.cards.create.useMutation({
    onSuccess: (data) => {
      if (Platform.OS === "web") clearTempPhotos();
      else AsyncStorage.removeItem(TEMP_PHOTOS_KEY).catch(console.error);
      router.replace(`/waiting?cardId=${data.cardId}`);
    },
    onError: (error) => {
      const msg = error.message || "创建失败，请重试";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("错误", msg);
    },
  });

  useEffect(() => {
    const loadPhotos = async () => {
      try {
        console.log("[self-guess] loadPhotos start");
        const memData = getTempPhotos();
        console.log("[self-guess] memData:", memData?.length ?? 0);
        if (memData && memData.length > 0) {
          setPhotos(memData);
          return;
        }

        if (Platform.OS !== "web") {
          const data = await AsyncStorage.getItem(TEMP_PHOTOS_KEY);
          console.log("[self-guess] storage raw:", data ? `len=${data.length}` : "null");
          if (data) {
            const parsed = JSON.parse(data);
            console.log("[self-guess] storage parsed:", parsed?.length ?? 0);
            setPhotos(parsed);
            return;
          }
        }

        Alert.alert("错误", "未找到照片数据");
      } catch (e) {
        console.error("Failed to load photos:", e);
        Alert.alert("错误", "加载照片失败");
      } finally {
        setLoading(false);
      }
    };

    loadPhotos();
  }, []);

  useEffect(() => {
    console.log(
      "[self-guess] photos state:",
      photos.map((p) => ({
        uri: p.uri,
        mimeType: p.mimeType,
        hasBase64: !!p.base64,
        base64Len: p.base64?.length ?? 0,
      }))
    );
  }, [photos]);

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
  };

  const handleConfirm = () => {
    if (selectedIndex === null) {
      const msg = "请选择你认为会被选中的照片";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("提示", msg);
      return;
    }

    if (photos.length < 2) {
      const msg = "照片数据异常，请返回重新选择";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("错误", msg);
      return;
    }

    createCardMutation.mutate({
      predictedPhotoIndex: selectedIndex,
      photos: photos.map((p) => ({
        base64: p.base64,
        mimeType: p.mimeType,
      })),
    });
  };

  const handleBack = () => {
    if (Platform.OS === "web") clearTempPhotos();
    else AsyncStorage.removeItem(TEMP_PHOTOS_KEY).catch(console.error);
    router.back();
  };

  const canConfirm = useMemo(() => {
    return selectedIndex !== null && photos.length >= 2;
  }, [selectedIndex, photos.length]);

  if (loading) {
    return (
      <ScreenContainer edges={["top", "left", "right", "bottom"]} className="flex-1">
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>加载照片中...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} className="flex-1">
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <IconSymbol name="arrow.left" size={24} color="#11181C" />
          </Pressable>
          <Text style={styles.title}>做个预测</Text>
          <View style={styles.placeholder} />
        </View>

        <Text style={styles.subtitle}>选择你认为大家会选中的那张照片</Text>
        <Text style={styles.debugText}>共 {photos.length} 张</Text>

        <View style={styles.gridContainer}>
          {photos.map((photo, index) => {
            const imageUri =
              photo.base64 ? `data:${photo.mimeType};base64,${photo.base64}` : photo.uri || "";
            return (
              <View key={`${photo.uri}-${index}`} style={styles.gridItem}>
                <Pressable
                  onPress={() => handleSelect(index)}
                  style={({ pressed }) => [
                    styles.photoContainer,
                    selectedIndex === index && styles.photoSelected,
                    pressed && styles.photoPressed,
                  ]}
                >
                  {imageUri ? (
                    <RNImage source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
                  ) : (
                    <View style={styles.photoFallback} />
                  )}
                  {selectedIndex === index && (
                    <View style={styles.selectedOverlay}>
                      <View style={styles.checkmark}>
                        <Text style={styles.checkmarkText}>✓</Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        {photos.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>未找到照片，请返回重选</Text>
            <ActionButton
              title="返回重选"
              onPress={handleBack}
              variant="outline"
              size="medium"
              fullWidth
            />
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.hintText}>
            {selectedIndex !== null ? `已选择第 ${selectedIndex + 1} 张照片` : "点击选择一张照片"}
          </Text>
          <ActionButton
            title="确认创建"
            onPress={handleConfirm}
            disabled={!canConfirm}
            loading={createCardMutation.isPending}
            size="large"
            fullWidth
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#687076",
    marginTop: 16,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
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
  subtitle: {
    fontSize: 14,
    color: "#687076",
    textAlign: "center",
    marginBottom: 24,
  },
  debugText: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 12,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridItem: {
    width: "48%",
    aspectRatio: 1,
    marginBottom: 12,
  },
  photoContainer: {
    width: "45%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "transparent",
    backgroundColor: "#F3F4F6",
  },
  photoSelected: {
    borderColor: "#6366F1",
  },
  photoPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E5E7EB",
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(99, 102, 241, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkText: {
    color: "white",
    fontSize: 28,
    fontWeight: "bold",
  },
  footer: {
    marginTop: 32,
    alignItems: "center",
    gap: 16,
    width: "100%",
  },
  hintText: {
    fontSize: 14,
    color: "#687076",
  },
  emptyState: {
    marginTop: 24,
    gap: 12,
    alignItems: "center",
    width: "100%",
  },
  emptyText: {
    fontSize: 14,
    color: "#687076",
  },
});
