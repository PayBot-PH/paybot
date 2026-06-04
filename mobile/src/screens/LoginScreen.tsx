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
} from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';

// Base API URL - ensure this matches your backend deployment
const API_URL = 'https://mayaproduction.up.railway.app';

export const LoginScreen = ({ navigation }) => {
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
      const response = await fetch(`${API_URL}/api/v1/auth/terminal-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      await AsyncStorage.setItem('auth_token', data.access_token);
      Toast.show({ type: 'success', text1: 'Login successful' });
      // The RootNavigator in App.tsx should react to this if it's set up to listen to AsyncStorage or via a context
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Login failed', text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramAuth = async (navState) => {
    // The bridge page redirects to /auth/callback with user data in params
    if (navState.url.includes('/auth/callback?')) {
      setShowTelegramLogin(false);
      setLoading(true);

      try {
        const queryString = navState.url.split('?')[1];
        const params = Object.fromEntries(new URLSearchParams(queryString));

        const response = await fetch(`${API_URL}/api/v1/auth/telegram-login-widget`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || 'Telegram login failed');
        }

        await AsyncStorage.setItem('auth_token', data.token);
        Toast.show({ type: 'success', text1: 'Welcome!', text2: 'Logged in via Telegram' });
      } catch (error) {
        Toast.show({ type: 'error', text1: 'Telegram login failed', text2: error.message });
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoEmoji}>🤖</Text>
          <Text style={styles.title}>PayBot POS</Text>
        </View>
        <Text style={styles.subtitle}>Log in to your terminal</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor="#94A3B8"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor="#94A3B8"
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.line} />
          </View>

          <TouchableOpacity
            style={styles.telegramButton}
            onPress={() => setShowTelegramLogin(true)}
            disabled={loading}
          >
            <Text style={styles.telegramButtonText}>Continue with Telegram</Text>
          </TouchableOpacity>
          <Text style={styles.tip}>
            Auto-signup creates accurate records via Telegram
          </Text>
        </View>
      </View>

      <Modal
        visible={showTelegramLogin}
        animationType="slide"
        onRequestClose={() => setShowTelegramLogin(false)}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowTelegramLogin(false)}>
              <Text style={styles.closeButton}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Telegram Login</Text>
            <View style={{ width: 50 }} />
          </View>
          <WebView
            source={{ uri: `${API_URL}/api/v1/auth/telegram-login-widget-page?redirect_url=${API_URL}/auth/callback` }}
            onNavigationStateChange={handleTelegramAuth}
            startInLoadingState
            renderLoading={() => <ActivityIndicator style={styles.loader} size="large" color="#0EA5E9" />}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: '#0EA5E9',
    textAlign: 'center',
    letterSpacing: -1.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 48,
    fontWeight: '500',
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    color: '#0F172A',
  },
  button: {
    backgroundColor: '#0EA5E9',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 16,
    elevation: 8,
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 32,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  telegramButton: {
    backgroundColor: '#26A5E4',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 0,
  },
  telegramButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  tip: {
    textAlign: 'center',
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 12,
  },
  modalHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  closeButton: {
    color: '#0EA5E9',
    fontSize: 16,
    fontWeight: '500',
  },
  loader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -25,
    marginTop: -25,
  },
});
