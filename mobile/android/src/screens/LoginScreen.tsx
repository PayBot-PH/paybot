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

import DeviceInfo from 'react-native-device-info';

export const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useContext(AuthContext);

  const handleLogin = async () => {
    if (!email || !password) {
      Toast.show({ type: 'error', text1: 'Please fill in all fields' });
      return;
    }

    setLoading(true);
    try {
      const deviceId = await DeviceInfo.getUniqueId();
      console.log('Logging in with:', email, 'on device:', deviceId);

      // Call real login API in production
      const response = await fetch('https://paybot-production-7350.up.railway.app/api/v1/auth/terminal-login', {
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
        Toast.show({ type: 'success', text1: 'Login successful' });
      } else {
        throw new Error(result.detail || 'Invalid credentials');
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Login failed', text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>PayBot POS</Text>
        <Text style={styles.subtitle}>Log in to your terminal</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
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
            <Text style={styles.buttonText}>Login</Text>
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
