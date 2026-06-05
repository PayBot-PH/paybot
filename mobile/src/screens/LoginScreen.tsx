import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  StatusBar,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Toast from 'react-native-toast-message';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../contexts/AuthContext';
import { API_URL, API_BASE_URL } from '../config';
import { useTheme } from '../theme';

export const LoginScreen = () => {
  const { colors, common, roundness, isDark } = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTelegramLogin, setShowTelegramLogin] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Toast.show({ type: 'error', text1: 'Please fill in all fields' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/terminal-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      await login(data.access_token, data.user);
      Toast.show({ type: 'success', text1: 'Login successful' });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Login failed', text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramAuth = async (navState) => {
    if (navState.url.includes('/auth/callback?')) {
      setShowTelegramLogin(false);
      setLoading(true);

      try {
        const queryString = navState.url.split('?')[1];
        const params = Object.fromEntries(new URLSearchParams(queryString));

        const response = await fetch(`${API_URL}/auth/telegram-login-widget`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || 'Telegram login failed');
        }

        await login(data.token, data.user);
        Toast.show({ type: 'success', text1: 'Welcome!', text2: 'Logged in via Telegram' });
      } catch (error) {
        Toast.show({ type: 'error', text1: 'Telegram login failed', text2: error.message });
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={[styles.logoIcon, { backgroundColor: common.primary }]}>
                 <MaterialIcons name="bolt" size={48} color="#fff" />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>PayBot</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Terminal Edition</Text>
            </View>

            <View style={styles.form}>
              <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Business Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="lock-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <TouchableOpacity
                style={[styles.loginButton, { backgroundColor: common.primary, borderRadius: roundness.lg }]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.loginButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={[styles.line, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.textSecondary }]}>SECURE ACCESS</Text>
                <View style={[styles.line, { backgroundColor: colors.border }]} />
              </View>

              <TouchableOpacity
                style={[styles.telegramButton, { borderRadius: roundness.lg }]}
                onPress={() => setShowTelegramLogin(true)}
                disabled={loading}
              >
                <MaterialIcons name="send" size={20} color="#fff" style={{ marginRight: 10 }} />
                <Text style={styles.telegramButtonText}>Log in with Telegram</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
               <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                 Protected by PayBot Security
               </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

      <Modal
        visible={showTelegramLogin}
        animationType="slide"
        onRequestClose={() => setShowTelegramLogin(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
            <TouchableOpacity onPress={() => setShowTelegramLogin(false)} style={styles.modalCloseBtn}>
              <MaterialIcons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Telegram Authentication</Text>
            <View style={{ width: 44 }} />
          </View>
          <WebView
            source={{ uri: `${API_URL}/auth/telegram-login-widget-page?redirect_url=${API_BASE_URL}/auth/callback` }}
            onNavigationStateChange={handleTelegramAuth}
            startInLoadingState
            renderLoading={() => <ActivityIndicator style={styles.loader} size="large" color={common.primary} />}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  content: { flex: 1, padding: 32, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 48 },
  logoIcon: {
     width: 80,
     height: 80,
     borderRadius: 24,
     alignItems: 'center',
     justifyContent: 'center',
     marginBottom: 16,
     elevation: 8,
     shadowColor: '#0EA5E9',
     shadowOffset: { width: 0, height: 4 },
     shadowOpacity: 0.3,
     shadowRadius: 12,
  },
  title: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 16, fontWeight: '600', marginTop: -4 },
  form: { width: '100%' },
  inputContainer: {
     flexDirection: 'row',
     alignItems: 'center',
     borderWidth: 1,
     borderRadius: 16,
     marginBottom: 16,
     paddingHorizontal: 16,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 18, fontSize: 16, fontWeight: '600' },
  loginButton: {
     paddingVertical: 18,
     alignItems: 'center',
     marginTop: 10,
     elevation: 4,
  },
  loginButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 32 },
  line: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 16, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  telegramButton: {
    backgroundColor: '#26A5E4',
    paddingVertical: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  telegramButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { marginTop: 40, alignItems: 'center' },
  footerText: { fontSize: 12, fontWeight: '600' },
  modalHeader: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  modalCloseBtn: { padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  loader: { position: 'absolute', top: '50%', left: '50%', marginLeft: -25, marginTop: -25 },
});
