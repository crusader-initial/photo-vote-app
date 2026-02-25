import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";

/** 中国大陆手机号：1 开头，第二位 3-9，共 11 位 */
const PHONE_REGEX = /^1[3-9]\d{9}$/;

function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone.trim());
}

const CODE_COOLDOWN_SEC = 60;

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendCodeLoading, setSendCodeLoading] = useState(false);
  const [error, setError] = useState("");
  const [codeCooldown, setCodeCooldown] = useState(0);

  const handleSendCode = useCallback(async () => {
    const raw = phone.trim();
    if (!raw) {
      setError("请输入手机号");
      return;
    }
    if (!isValidPhone(raw)) {
      setError("请输入正确的手机号");
      return;
    }
    setError("");
    setSendCodeLoading(true);
    try {
      await Api.sendVerificationCode(raw);
      setCodeCooldown(CODE_COOLDOWN_SEC);
      const timer = setInterval(() => {
        setCodeCooldown((s) => {
          if (s <= 1) {
            clearInterval(timer);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (e: any) {
      setError(e?.message || "发送失败");
    } finally {
      setSendCodeLoading(false);
    }
  }, [phone]);

  const handleSubmit = async () => {
    const raw = phone.trim();
    if (!raw) {
      setError("请输入手机号");
      return;
    }
    if (!isValidPhone(raw)) {
      setError("请输入正确的手机号");
      return;
    }
    const codeStr = code.trim();
    if (codeStr.length !== 6 || !/^\d{6}$/.test(codeStr)) {
      setError("请输入 6 位验证码");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await Api.phoneLoginWithCode(raw, codeStr);

      const userForStorage = {
        ...result.user,
        lastSignedIn: new Date(result.user.lastSignedIn),
      };
      await Auth.setUserInfo(userForStorage as Auth.User);
      if (result.token && Platform.OS !== "web") {
        await Auth.setSessionToken(result.token);
      }
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <IconSymbol name="arrow.left" size={24} color="#11181C" />
          </Pressable>
          <Text style={styles.title}>登录</Text>
          <Text style={styles.subtitle}>
            使用手机号验证码登录，同步你的收藏
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="手机号"
            placeholderTextColor="#9CA3AF"
            value={phone}
            onChangeText={(t) => { setPhone(t.replace(/\D/g, "").slice(0, 11)); setError(""); }}
            keyboardType="phone-pad"
            maxLength={11}
            editable={!loading}
          />
          <View style={styles.codeRow}>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="验证码（6 位）"
              placeholderTextColor="#9CA3AF"
              value={code}
              onChangeText={(t) => { setCode(t.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
            />
            <Pressable
              onPress={handleSendCode}
              disabled={sendCodeLoading || codeCooldown > 0 || !isValidPhone(phone.trim())}
            >
              <View
                style={[
                  styles.sendCodeBtn,
                  (sendCodeLoading || codeCooldown > 0 || !isValidPhone(phone.trim())) &&
                    styles.sendCodeBtnDisabled,
                ]}
              >
                {sendCodeLoading ? (
                  <ActivityIndicator size="small" color="#6366F1" />
                ) : codeCooldown > 0 ? (
                  <Text style={styles.sendCodeText}>{codeCooldown}s 后重发</Text>
                ) : (
                  <Text style={styles.sendCodeText}>获取验证码</Text>
                )}
              </View>
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={handleSubmit} disabled={loading}>
            {({ pressed }) => (
              <View
                style={[
                  styles.submit,
                  pressed && styles.submitPressed,
                  loading && styles.submitDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>登录</Text>
                )}
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 16,
    marginBottom: 32,
  },
  backBtn: {
    alignSelf: "flex-start",
    padding: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#11181C",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#687076",
    lineHeight: 20,
  },
  form: {
    gap: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#11181C",
  },
  codeRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  codeInput: {
    flex: 1,
  },
  sendCodeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#6366F1",
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  sendCodeBtnDisabled: {
    borderColor: "#E5E7EB",
    opacity: 0.7,
  },
  sendCodeText: {
    fontSize: 14,
    color: "#6366F1",
    fontWeight: "600",
  },
  error: {
    fontSize: 14,
    color: "#EF4444",
    marginTop: -4,
  },
  submit: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    minHeight: 52,
  },
  submitPressed: {
    opacity: 0.9,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});
