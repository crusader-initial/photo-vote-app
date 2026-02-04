import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton } from "@/components/action-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useDeviceId } from "@/hooks/use-device-id";
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
  const { deviceId, loading: deviceIdLoading } = useDeviceId();
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
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("错误", msg);
      }
    },
  });

  // 加载照片：网页端从内存取，APP 端从 AsyncStorage 取
  useEffect(() => {
    const loadPhotos = async () => {
      try {
        if (Platform.OS === "web") {
          const data = getTempPhotos();
          if (data && data.length > 0) {
            setPhotos(data);
          } else {
            Alert.alert("错误", "未找到照片数据");
            router.back();
          }
        } else {
          const data = await AsyncStorage.getItem(TEMP_PHOTOS_KEY);
          if (data) {
            const parsed = JSON.parse(data);
            setPhotos(parsed);
          } else {
            Alert.alert("错误", "未找到照片数据");
            router.back();
          }
        }
      } catch (e) {
        console.error("Failed to load photos:", e);
        Alert.alert("错误", "加载照片失败");
        router.back();
      } finally {
        setLoading(false);
      }
    };

    loadPhotos();
  }, []);

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

    if (!deviceId) {
      const msg = "设备ID未初始化，请稍候再试";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("错误", msg);
      return;
    }

    if (photos.length < 2) {
      const msg = "照片数据异常，请返回重新选择";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("错误", msg);
      return;
    }

    createCardMutation.mutate({
      deviceId,
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
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <IconSymbol name="arrow.left" size={24} color="#11181C" />
          </Pressable>
          <Text style={styles.title}>做个预测</Text>
          <View style={styles.placeholder} />
        </View>

        <Text style={styles.subtitle}>
          选择你认为大家会选中的那张照片
        </Text>

        {/* Photo Grid */}
        <View style={styles.gridContainer}>
          {photos.map((photo, index) => (
            <Pressable
              key={index}
              onPress={() => handleSelect(index)}
              style={({ pressed }) => [
                styles.photoContainer,
                selectedIndex === index && styles.photoSelected,
                pressed && styles.photoPressed,
              ]}
            >
              <Image
                source={{ uri: photo.uri }}
                style={styles.photo}
                contentFit="cover"
              />
              {selectedIndex === index && (
                <View style={styles.selectedOverlay}>
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.hintText}>
            {selectedIndex !== null
              ? `已选择第 ${selectedIndex + 1} 张照片`
              : "点击选择一张照片"}
          </Text>
          {deviceIdLoading && (
            <Text style={styles.hintText}>正在准备...</Text>
          )}
          <ActionButton
            title="确认创建"
            onPress={handleConfirm}
            disabled={selectedIndex === null || !deviceId || photos.length < 2 || deviceIdLoading}
            loading={createCardMutation.isPending}
            size="large"
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
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  photoContainer: {
    width: "45%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "transparent",
  },
  photoSelected: {
    borderColor: "#6366F1",
  },
  photoPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  photo: {
    width: "100%",
    height: "100%",
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
  },
  hintText: {
    fontSize: 14,
    color: "#687076",
  },
});
