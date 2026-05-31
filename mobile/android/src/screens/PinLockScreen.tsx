import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { Config } from '../Config';
import { Strings } from '../strings';

const { width } = Dimensions.get('window');

const COLORS = {
  primary: '#3B82F6',
  dark: '#111827',
  light: '#F3F4F6',
  text: '#111827',
  textSecondary: '#6B7280',
  danger: '#EF4444',
};

export const PinLockScreen = ({ onUnlock, onLogout }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleKeyPress = (num) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    if (pin.length === 4) {
      verifyPin();
    }
  }, [pin]);

  const verifyPin = async () => {
    try {
      const terminalId = await AsyncStorage.getItem('terminal_id');
      const token = await AsyncStorage.getItem('auth_token');

      if (!terminalId || !token) {
        onLogout();
        return;
      }

      const response = await fetch(`${Config.API_BASE_URL}/pos-terminals/${terminalId}/pin/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ pin }),
      });

      if (response.ok) {
        onUnlock();
      } else {
        setError(true);
        setPin('');
        Toast.show({ type: 'error', text1: Strings.pinLock.invalidPin });
      }
    } catch (err) {
      console.error('PIN verification failed', err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="lock" size={48} color={COLORS.primary} />
        <Text style={styles.title}>{Strings.pinLock.title}</Text>
        <Text style={styles.subtitle}>{Strings.pinLock.subtitle}</Text>
      </View>

      <View style={styles.dotsContainer}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              pin.length >= i && styles.dotFilled,
              error && styles.dotError
            ]}
          />
        ))}
      </View>

      <View style={styles.keypad}>
        <View style={styles.row}>
          {[1, 2, 3].map(n => (
            <TouchableOpacity key={n} style={styles.key} onPress={() => handleKeyPress(n)}>
              <Text style={styles.keyText}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          {[4, 5, 6].map(n => (
            <TouchableOpacity key={n} style={styles.key} onPress={() => handleKeyPress(n)}>
              <Text style={styles.keyText}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          {[7, 8, 9].map(n => (
            <TouchableOpacity key={n} style={styles.key} onPress={() => handleKeyPress(n)}>
              <Text style={styles.keyText}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={styles.key} onPress={onLogout}>
            <Text style={[styles.keyText, { fontSize: 16, color: COLORS.danger }]}>{Strings.pinLock.logout}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress(0)}>
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={handleDelete}>
            <MaterialIcons name="backspace" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 60,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.light,
  },
  dotFilled: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dotError: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.danger,
  },
  keypad: {
    width: width * 0.8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  key: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.text,
  },
});
