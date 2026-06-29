import React, { useContext, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Modal, TextInput, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Toast from 'react-native-toast-message';
import { AuthContext } from '../App';
import { Config } from '../Config';
import { Strings } from '../strings';

export const SettingsScreen = ({ navigation }) => {
  const { signOut } = useContext(AuthContext);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    await signOut();
  };

  const handleSetPin = async () => {
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      Toast.show({ type: 'error', text1: Strings.settings.pinLengthError });
      return;
    }

    setLoading(true);
    try {
      const terminalId = await AsyncStorage.getItem('terminal_id');
      const token = await AsyncStorage.getItem('auth_token');

      const response = await fetch(`${Config.API_BASE_URL}/pos-terminals/${terminalId}/pin/set`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ pin }),
      });

      if (response.ok) {
        await AsyncStorage.setItem('has_pin', 'true');
        Toast.show({ type: 'success', text1: Strings.settings.pinSuccess });
        setShowPinModal(false);
        setPin('');
      } else {
        const error = await response.json();
        throw new Error(error.detail || Strings.settings.pinFailed);
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{Strings.settings.title}</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.item}>
          <MaterialIcons name="person" size={24} color="#4B5563" />
          <Text style={styles.itemText}>{Strings.settings.profile}</Text>
          <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.item} onPress={() => setShowPinModal(true)}>
          <MaterialIcons name="lock" size={24} color="#4B5563" />
          <Text style={styles.itemText}>{Strings.settings.setPin}</Text>
          <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.item, styles.logoutItem]} onPress={handleLogout}>
          <MaterialIcons name="logout" size={24} color="#EF4444" />
          <Text style={[styles.itemText, styles.logoutText]}>{Strings.settings.logout}</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showPinModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{Strings.settings.pinModalTitle}</Text>
            <Text style={styles.modalSubtitle}>{Strings.settings.pinModalSubtitle}</Text>

            <TextInput
              style={styles.pinInput}
              placeholder="0000"
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              value={pin}
              onChangeText={setPin}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => { setShowPinModal(false); setPin(''); }}
              >
                <Text style={styles.cancelButtonText}>{Strings.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSetPin}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{Strings.settings.savePin}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  content: {
    padding: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemText: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
    color: '#374151',
  },
  logoutItem: {
    marginTop: 32,
    borderBottomWidth: 0,
  },
  logoutText: {
    color: '#EF4444',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  pinInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 16,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 10,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
