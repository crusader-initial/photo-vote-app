import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { ActionButton } from "@/components/action-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { setTempPhotos } from "@/lib/temp-photos-store";

interface SelectedPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

const TEMP_PHOTOS_KEY = "@temp_photos";

export default function CreateScreen() {
  const router = useRouter();
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const pickImage = async () => {
    const remainingSlots = 4 - photos.length;
    
    if (remainingSlots <= 0) {
      Alert.alert("提示", "已达到最多4张照片");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true, // 允许多选
      selectionLimit: remainingSlots, // 根据剩余位置限制
      quality: 0.7, // 降低质量以减小体积
      base64: true,
      allowsEditing: false, // 禁用编辑以支持多选
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      // 处理选中的所有图片
      const newPhotos: SelectedPhoto[] = [];
      
      for (const asset of result.assets) {
        // 检查是否还有空位
        if (photos.length + newPhotos.length >= 4) {
          break; // 达到上限，停止添加
        }
        
        if (asset.base64) {
          newPhotos.push({
            uri: asset.uri,
            base64: asset.base64,
            mimeType: asset.mimeType || "image/jpeg",
          });
        }
      }
      
      if (newPhotos.length > 0) {
        // 合并照片，确保不超过4张
        const allPhotos = [...photos, ...newPhotos].slice(0, 4);
        setPhotos(allPhotos);
        
        // 如果有照片被截断，提示用户
        const totalSelected = result.assets.length;
        const actuallyAdded = newPhotos.length;
        const skipped = totalSelected - actuallyAdded;
        
        if (skipped > 0) {
          Alert.alert(
            "提示", 
            `已添加 ${actuallyAdded} 张照片，${skipped} 张超出限制未添加`
          );
        }
      }
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleNext = async () => {
    if (photos.length < 2) {
      Alert.alert("提示", "请至少选择2张照片");
      return;
    }

    if (isProcessing) return;

    setIsProcessing(true);

    try {
      if (Platform.OS === "web") {
        // 网页端：用内存暂存，避免 localStorage 约 5MB 限制导致存图失败
        setTempPhotos(photos);
        router.push("/self-guess");
      } else {
        await AsyncStorage.setItem(TEMP_PHOTOS_KEY, JSON.stringify(photos));
        router.push("/self-guess");
      }
    } catch (error) {
      console.error("Failed to save photos:", error);
      Alert.alert("错误", "保存照片失败，请重试");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} className="flex-1">
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <IconSymbol name="arrow.left" size={24} color="#11181C" />
          </Pressable>
          <Text style={styles.title}>选择照片</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Subtitle - 始终显示 */}
        <Text style={styles.subtitle}>
          请选择 2~4 张照片创建投票卡片
        </Text>

        {/* Upload Button - 大按钮 */}
        {photos.length < 4 && (
          <Pressable
            onPress={pickImage}
            style={({ pressed }) => [
              styles.uploadButton,
              pressed && styles.uploadButtonPressed,
            ]}
          >
            <View style={styles.uploadButtonIcon}>
              <IconSymbol name="photo.stack.fill" size={48} color="#6366F1" />
            </View>
            <Text style={styles.uploadButtonTitle}>
              {photos.length === 0 ? "上传照片" : "继续添加照片"}
            </Text>
            <Text style={styles.uploadButtonSubtitle}>
              {photos.length === 0 
                ? "点击选择 2~4 张照片" 
                : `已选 ${photos.length} 张，还可添加 ${4 - photos.length} 张`}
            </Text>
          </Pressable>
        )}

        {/* Photo Grid - 显示已上传的照片 */}
        {photos.length > 0 && (
          <View style={styles.photosSection}>
            <Text style={styles.photosSectionTitle}>
              已选择的照片 ({photos.length})
            </Text>
            <View style={styles.gridContainer}>
              {photos.map((photo, index) => (
                <View key={index} style={styles.gridItem}>
                  <View style={styles.photoContainer}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.photo}
                      contentFit="cover"
                    />
                    <Pressable
                      onPress={() => removePhoto(index)}
                      style={styles.removeButton}
                    >
                      <IconSymbol name="xmark" size={16} color="#ffffff" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 占位空间，确保按钮在底部 */}
        <View style={{ flex: 1, minHeight: 40 }} />

        {/* Footer - 只有满足条件才显示下一步按钮 */}
        {photos.length >= 2 && (
          <View style={styles.footer}>
            <Text style={styles.successText}>
              ✓ 已选择 {photos.length} 张照片，可以继续了
            </Text>
            {isProcessing ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={styles.processingText}>处理中...</Text>
              </View>
            ) : (
              <ActionButton
                title="下一步"
                onPress={handleNext}
                size="large"
              />
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#11181C",
  },
  placeholder: {
    width: 40,
  },
  subtitle: {
    fontSize: 16,
    color: "#687076",
    textAlign: "center",
    marginBottom: 32,
  },
  uploadButton: {
    backgroundColor: "#F5F5F5",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#6366F1",
    borderStyle: "dashed",
    marginBottom: 32,
  },
  uploadButtonPressed: {
    backgroundColor: "#E5E7EB",
    opacity: 0.9,
  },
  uploadButtonIcon: {
    marginBottom: 16,
  },
  uploadButtonTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#6366F1",
    marginBottom: 8,
  },
  uploadButtonSubtitle: {
    fontSize: 14,
    color: "#687076",
  },
  photosSection: {
    marginBottom: 24,
  },
  photosSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#11181C",
    marginBottom: 16,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridItem: {
    width: "31%",
    aspectRatio: 1,
  },
  photoContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  removeButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    alignItems: "center",
    gap: 16,
    paddingTop: 16,
  },
  successText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#22C55E",
  },
  processingContainer: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 20,
  },
  processingText: {
    fontSize: 16,
    color: "#687076",
  },
});
