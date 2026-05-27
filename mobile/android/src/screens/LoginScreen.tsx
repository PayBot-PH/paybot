import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { AuthContext } from '../App';
import { SvgXml } from 'react-native-svg';
import { Config } from '../Config';
import { Strings } from '../strings';

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
  const { signIn } = useContext(AuthContext);

  const handleLogin = async () => {
    if (!email || !password) {
      Toast.show({ type: 'error', text1: Strings.login.fillFields });
      return;
    }

    setLoading(true);
    try {
      const deviceId = await DeviceInfo.getUniqueId();

      // Call real login API in production
      const response = await fetch(`${Config.API_BASE_URL}/auth/terminal-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, device_id: deviceId }),
      });

      const result = await response.json();

      if (response.ok && result.access_token) {
        // Save terminal info if available
        if (result.terminal_id) {
           await AsyncStorage.setItem('terminal_id', result.terminal_id.toString());
        }
        await AsyncStorage.setItem('has_pin', result.has_pin ? 'true' : 'false');

        await signIn(result.access_token);
        Toast.show({ type: 'success', text1: Strings.login.loginSuccess });
      } else {
        throw new Error(result.detail || 'Invalid credentials');
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: Strings.login.loginFailed, text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
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

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{Strings.login.loginButton}</Text>
          )}
        </TouchableOpacity>
      </View>
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
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
