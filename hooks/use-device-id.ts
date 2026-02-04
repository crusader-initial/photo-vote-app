import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "photo_vote_device_id";

function generateDeviceId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `device_${timestamp}_${randomPart}`;
}

export function useDeviceId() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOrCreateDeviceId() {
      try {
        let storedId = await AsyncStorage.getItem(DEVICE_ID_KEY);
        
        if (!storedId) {
          storedId = generateDeviceId();
          await AsyncStorage.setItem(DEVICE_ID_KEY, storedId);
        }
        
        setDeviceId(storedId);
      } catch (error) {
        console.error("Failed to load device ID:", error);
        // Fallback to a temporary ID
        setDeviceId(generateDeviceId());
      } finally {
        setLoading(false);
      }
    }

    loadOrCreateDeviceId();
  }, []);

  return { deviceId, loading };
}
