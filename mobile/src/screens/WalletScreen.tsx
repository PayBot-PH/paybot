import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  ImageBackground,
} from 'react-native';
import { useQuery, useMutation } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Toast from 'react-native-toast-message';
import { API_URL } from '../config';
import { useTheme } from '../theme';

const api = {
  getBalance: async (token) => {
    const response = await fetch(`${API_URL}/wallet/balance`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to fetch balance');
    return response.json();
  },
  withdraw: async (token, data) => {
    const response = await fetch(`${API_URL}/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Withdrawal failed');
    }
    return response.json();
  },
};

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  ImageBackground,
  Alert,
  Modal,
} from 'react-native';
import { useQuery, useMutation } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Toast from 'react-native-toast-message';
import { API_URL } from '../config';
import { useTheme } from '../theme';
import { useAuth } from '../contexts/AuthContext';

const api = {
  getBalance: async (token) => {
    const response = await fetch(`${API_URL}/wallet/balance`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to fetch balance');
    return response.json();
  },
  withdraw: async (token, data) => {
    const response = await fetch(`${API_URL}/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Withdrawal failed');
    }
    return response.json();
  },
  requestTopup: async (token, data) => {
    const response = await fetch(`${API_URL}/topup/request`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Top-up request failed');
    }
    return response.json();
  }
};

export const WalletScreen = () => {
  const { colors, common, shadows, roundness } = useTheme();
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [note, setNote] = useState('');
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');

  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    const loadToken = async () => {
      const storedToken = await AsyncStorage.getItem('auth_token');
      setToken(storedToken);
    };
    loadToken();
  }, []);

  const balanceQuery = useQuery(['balance', token], () => api.getBalance(token), {
    enabled: !!token,
  });

  const withdrawMutation = useMutation((data: any) => api.withdraw(token, data), {
    onSuccess: () => {
      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Withdrawal request submitted',
      });
      setAmount('');
      setBankName('');
      setAccountNumber('');
      setNote('');
      balanceQuery.refetch();
    },
    onError: (error: any) => {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message,
      });
    },
  });

  const topupMutation = useMutation((data: any) => api.requestTopup(token, data), {
    onSuccess: () => {
      Toast.show({
        type: 'success',
        text1: 'Request Sent',
        text2: 'Admin will review your top-up request',
      });
      setShowTopupModal(false);
      setTopupAmount('');
    },
    onError: (error: any) => {
      Alert.alert('Coming Soon', 'Manual top-up request via app is being integrated. Please use the Telegram bot for now.');
      setShowTopupModal(false);
    }
  });

  const handleWithdraw = () => {
    if (!amount || !bankName || !accountNumber) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please fill in all required fields',
      });
      return;
    }
    setPin('');
    setShowPinModal(true);
  };

  const executeWithdraw = async () => {
    if (pin.length < 4) {
      Toast.show({ type: 'error', text1: 'Enter valid PIN' });
      return;
    }
    setPinLoading(true);
    try {
      const response = await fetch(`${API_URL}/wallet/withdraw`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          bank_name: bankName,
          account_number: accountNumber,
          note: note,
          pin: pin
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Withdrawal failed');
      }

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Withdrawal request submitted',
      });
      setAmount('');
      setBankName('');
      setAccountNumber('');
      setNote('');
      setShowPinModal(false);
      balanceQuery.refetch();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message,
      });
      setPin('');
    } finally {
      setPinLoading(false);
    }
  };

  const handleTopup = () => {
    if (!topupAmount || isNaN(parseFloat(topupAmount))) {
      Toast.show({ type: 'error', text1: 'Invalid amount' });
      return;
    }
    topupMutation.mutate({ amount: parseFloat(topupAmount) });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={balanceQuery.isLoading}
            onRefresh={() => balanceQuery.refetch()}
            tintColor={common.primary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>My Wallet</Text>
        </View>

        <View style={[styles.balanceCard, { ...shadows.md }]}>
           <View style={styles.cardHeader}>
              <View>
                <Text style={styles.balanceLabel}>OPERATIONAL LIQUIDITY</Text>
                <View style={styles.verifiedRow}>
                   <MaterialIcons name="verified" size={12} color="#fff" />
                   <Text style={styles.verifiedText}>TRUSTED NODE</Text>
                </View>
              </View>
              <MaterialIcons name="security" size={28} color="rgba(255,255,255,0.4)" />
           </View>
          <Text style={styles.balanceAmount}>
            ₱{balanceQuery.data?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
          </Text>
          <View style={styles.cardFooter}>
             <View>
               <Text style={styles.cardLabel}>ACCOUNT HOLDER</Text>
               <Text style={styles.cardHolder}>{user?.name?.toUpperCase() || (user?.username?.toUpperCase()) || 'PAYBOT OPERATOR'}</Text>
             </View>
             <View style={{ alignItems: 'flex-end' }}>
               <Text style={styles.cardLabel}>NODE ID</Text>
               <Text style={styles.cardNumber}>{user?.id?.toString().padStart(8, '0') || '00000000'}</Text>
             </View>
          </View>
        </View>

        <View style={styles.complianceBanner}>
           <View style={styles.complianceItem}>
              <MaterialIcons name="gavel" size={14} color={colors.textSecondary} />
              <Text style={styles.complianceText}>BSP REGULATED</Text>
           </View>
           <View style={styles.complianceDivider} />
           <View style={styles.complianceItem}>
              <MaterialIcons name="security" size={14} color={colors.textSecondary} />
              <Text style={styles.complianceText}>PCI-DSS COMPLIANT</Text>
           </View>
        </View>

        <View style={styles.quickActions}>
           <TouchableOpacity style={styles.actionBtn} onPress={() => setShowTopupModal(true)}>
              <View style={[styles.actionIcon, { backgroundColor: common.primary + '15' }]}>
                 <MaterialIcons name="add-circle-outline" size={28} color={common.primary} />
              </View>
              <Text style={[styles.actionText, { color: colors.text }]}>Add Funds</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.actionBtn} onPress={() => Alert.alert('Bank Transfer', 'Internal inter-bank transfers are processed via InstaPay/PESONet.')}>
              <View style={[styles.actionIcon, { backgroundColor: common.success + '15' }]}>
                 <MaterialIcons name="account-balance" size={26} color={common.success} />
              </View>
              <Text style={[styles.actionText, { color: colors.text }]}>Transfers</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.actionBtn} onPress={() => Alert.alert('Settlements', 'Your terminal settlements are processed daily at 00:00 UTC.')}>
              <View style={[styles.actionIcon, { backgroundColor: common.warning + '15' }]}>
                 <MaterialIcons name="update" size={26} color={common.warning} />
              </View>
              <Text style={[styles.actionText, { color: colors.text }]}>Settlements</Text>
           </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: 20, paddingTop: 30 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Withdraw Funds</Text>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Amount (PHP)</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
               <Text style={[styles.currencyPrefix, { color: colors.textSecondary }]}>₱</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderWidth: 0 }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Destination Bank / E-Wallet</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="e.g. GCash, Maya, BDO"
              placeholderTextColor={colors.textSecondary}
              value={bankName}
              onChangeText={setBankName}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Account Number</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Enter account number"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={accountNumber}
              onChangeText={setAccountNumber}
            />
          </View>

          <TouchableOpacity
            style={[styles.withdrawButton, { backgroundColor: common.primary }]}
            onPress={handleWithdraw}
            disabled={withdrawMutation.isLoading}
          >
            {withdrawMutation.isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.withdrawButtonText}>Confirm Withdrawal</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Topup Modal */}
      <Modal
        visible={showTopupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTopupModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Request Top-up</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Enter the amount you wish to add to your wallet.
            </Text>

            <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 20 }]}>
               <Text style={[styles.currencyPrefix, { color: colors.textSecondary }]}>₱</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderWidth: 0 }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={topupAmount}
                  onChangeText={setTopupAmount}
                  autoFocus
                />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.surface }]}
                onPress={() => setShowTopupModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: common.primary }]}
                onPress={handleTopup}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PIN Modal */}
      <Modal
        visible={showPinModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
               <View style={[styles.actionIcon, { backgroundColor: colors.surface, marginBottom: 12 }]}>
                  <MaterialIcons name="lock-outline" size={32} color={common.primary} />
               </View>
               <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm Transaction</Text>
               <Text style={[styles.modalSubtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
                 Please enter your security PIN to authorize this withdrawal.
               </Text>
            </View>

            <TextInput
              style={[styles.pinInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="••••"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
              value={pin}
              onChangeText={setPin}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.surface }]}
                onPress={() => setShowPinModal(false)}
                disabled={pinLoading}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: common.primary }]}
                onPress={executeWithdraw}
                disabled={pinLoading || pin.length < 4}
              >
                {pinLoading ? <ActivityIndicator color="#fff" /> : <Text style={[styles.modalBtnText, { color: '#fff' }]}>Authorize</Text>}
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
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  balanceCard: {
    backgroundColor: '#0EA5E9',
    margin: 20,
    padding: 24,
    borderRadius: 24,
    height: 200,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  verifiedText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 8,
    fontWeight: '800',
    marginBottom: 2,
  },
  cardNumber: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  cardHolder: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  complianceBanner: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -10,
    marginBottom: 20,
    gap: 12,
  },
  complianceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  complianceText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
  },
  complianceDivider: {
    width: 1,
    height: 10,
    backgroundColor: '#CBD5E1',
  },
  quickActions: {
     flexDirection: 'row',
     justifyContent: 'space-around',
     paddingHorizontal: 20,
     marginTop: 10,
  },
  actionBtn: {
     alignItems: 'center',
  },
  actionIcon: {
     width: 56,
     height: 56,
     borderRadius: 16,
     alignItems: 'center',
     justifyContent: 'center',
     marginBottom: 8,
  },
  actionText: {
     fontSize: 12,
     fontWeight: '600',
  },
  section: {
    padding: 24,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
     flexDirection: 'row',
     alignItems: 'center',
     borderWidth: 1,
     borderRadius: 16,
     paddingHorizontal: 16,
  },
  currencyPrefix: {
     fontSize: 18,
     fontWeight: '700',
     marginRight: 8,
  },
  input: {
    flex: 1,
    height: 54,
    fontSize: 16,
    fontWeight: '600',
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  withdrawButton: {
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  withdrawButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    padding: 24,
    borderRadius: 24,
    elevation: 20,
  },
  modalSubtitle: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 32,
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  pinInput: {
    height: 60,
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 10,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});
