import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import Toast from 'react-native-toast-message';
import { AuthContext } from '../App';
import { SvgXml } from 'react-native-svg';
import { Config } from '../Config';
import { Strings } from '../strings';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import DeviceInfo from 'react-native-device-info';

const LOGO_XML = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" fill="#1557D0" rx="24"/>
  <rect x="20" y="32" width="60" height="46" rx="12" fill="none" stroke="white" stroke-width="5.5" stroke-linejoin="round"/>
  <line x1="50" y1="32" x2="50" y2="19" stroke="white" stroke-width="4.5" stroke-linecap="round"/>
  <circle cx="50" cy="14" r="6" fill="white"/>
  <rect x="26" y="46" width="20" height="12" rx="6" fill="white"/>
  <rect x="54" y="46" width="20" height="12" rx="6" fill="white"/>
  <path d="M 36 67 Q 50 77 64 67" fill="none" stroke="white" stroke-width="4.5" stroke-linecap="round"/>
</svg>
`;

export const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTelegramLogin, setShowTelegramLogin] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const isProcessing = useRef(false);
  const { signIn } = useContext(AuthContext);

  useEffect(() => {
    DeviceInfo.getUniqueId().then(id => setDeviceId(id));
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Toast.show({ type: 'error', text1: Strings.login.fillFields });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${Config.API_BASE_URL}/auth/terminal-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, device_id: deviceId }),
      });

      const result = await response.json();
      if (response.ok && result.access_token) {
        if (result.terminal_id) {
           await AsyncStorage.setItem('terminal_id', result.terminal_id.toString());
        }
        await AsyncStorage.setItem('has_pin', result.has_pin ? 'true' : 'false');
        await signIn(result.access_token);
      } else {
        throw new Error(result.detail || 'Invalid credentials');
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: Strings.login.loginFailed, text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  const processTelegramAuth = async (telegramUser) => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    // UI Feedback: Start handshake
    Toast.show({ type: 'info', text1: 'Authenticating...', text2: 'Establishing secure Telegram session' });

    try {
      const payload = { ...telegramUser, device_id: deviceId };
      const response = await fetch(`${Config.API_BASE_URL}/auth/telegram-login-widget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Handshake failed');

      if (result.token) {
         if (result.terminal_id) {
            await AsyncStorage.setItem('terminal_id', result.terminal_id.toString());
         }
         await AsyncStorage.setItem('has_pin', result.has_pin ? 'true' : 'false');

         // Success: Switch to dashboard
         setShowTelegramLogin(false);
         await signIn(result.token);
         Toast.show({ type: 'success', text1: 'Verified', text2: 'Merchant Node Activated' });
      } else {
         throw new Error('No session token returned');
      }
    } catch (error) {
      setShowTelegramLogin(false);
      Toast.show({ type: 'error', text1: 'Auth Error', text2: error.message });
    } finally {
      setLoading(false);
      isProcessing.current = false;
    }
  };

  const onMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data && data.id && data.hash) {
        processTelegramAuth(data);
      }
    } catch (e) {}
  };

  const handleNavigationStateChange = (navState) => {
    // Intercept redirect fallback
    if (navState.url.includes('auth/callback?')) {
      const queryString = navState.url.split('?')[1];
      const params = Object.fromEntries(new URLSearchParams(queryString));
      if (params.id && params.hash) {
        processTelegramAuth(params);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <SvgXml xml={LOGO_XML} width={100} height={100} />
        </View>
        <Text style={styles.title}>{Config.APP_NAME}</Text>
        <Text style={styles.subtitle}>{Strings.login.subtitle}</Text>

        <TextInput
          style={styles.input}
          placeholder={Strings.login.email}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder={Strings.login.password}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{Strings.login.loginButton}</Text>}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.line} /><Text style={styles.dividerText}>OR</Text><View style={styles.line} />
        </View>

        <TouchableOpacity style={styles.telegramButton} onPress={() => setShowTelegramLogin(true)} disabled={loading}>
          <MaterialIcons name="send" size={20} color="#fff" style={{ marginRight: 10 }} />
          <Text style={styles.buttonText}>Log in with Telegram</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showTelegramLogin} animationType="slide" onRequestClose={() => setShowTelegramLogin(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowTelegramLogin(false)} style={styles.modalCloseBtn}>
              <MaterialIcons name="close" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Secure Verification</Text>
            <View style={{ width: 44 }} />
          </View>
          <WebView
            source={{ uri: `${Config.API_BASE_URL}/auth/telegram-login-widget-page?redirect_url=${Config.API_BASE_URL}/auth/callback` }}
            onMessage={onMessage}
            onNavigationStateChange={handleNavigationStateChange}
            startInLoadingState
            domStorageEnabled={true}
            javaScriptEnabled={true}
            renderLoading={() => <ActivityIndicator style={styles.loader} size="large" color="#3B82F6" />}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1F2937', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6B7280', textAlign: 'center', marginBottom: 48 },
  logoContainer: { alignItems: 'center', marginBottom: 24 },
  input: { backgroundColor: '#F3F4F6', borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 16 },
  button: { backgroundColor: '#3B82F6', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 16 },
  telegramButton: { backgroundColor: '#26A5E4', borderRadius: 8, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  line: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { marginHorizontal: 16, color: '#9CA3AF', fontWeight: '600' },
  modalHeader: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalCloseBtn: { padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  loader: { position: 'absolute', top: '50%', left: '50%', marginLeft: -25, marginTop: -25 },
});
