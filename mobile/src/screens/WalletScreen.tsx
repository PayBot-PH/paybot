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

export const WalletScreen = () => {
  const { colors, common, shadows, roundness } = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [note, setNote] = useState('');

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
    onSuccess: (data) => {
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

  const handleWithdraw = () => {
    if (!amount || !bankName || !accountNumber) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please fill in all required fields',
      });
      return;
    }
    withdrawMutation.mutate({
      amount: parseFloat(amount),
      bank_name: bankName,
      account_number: accountNumber,
      note: note,
    });
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
              <Text style={styles.balanceLabel}>Total Balance</Text>
              <MaterialIcons name="contactless" size={24} color="rgba(255,255,255,0.6)" />
           </View>
          <Text style={styles.balanceAmount}>
            ₱{balanceQuery.data?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
          </Text>
          <View style={styles.cardFooter}>
             <Text style={styles.cardNumber}>**** **** **** 8888</Text>
             <Text style={styles.cardHolder}>PAYBOT PREMIUM</Text>
          </View>
        </View>

        <View style={styles.quickActions}>
           <TouchableOpacity style={styles.actionBtn}>
              <View style={[styles.actionIcon, { backgroundColor: '#E0F2FE' }]}>
                 <MaterialIcons name="add" size={28} color={common.primary} />
              </View>
              <Text style={[styles.actionText, { color: colors.text }]}>Top Up</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.actionBtn} onPress={() => {}}>
              <View style={[styles.actionIcon, { backgroundColor: '#DCFCE7' }]}>
                 <MaterialIcons name="send" size={26} color={common.success} />
              </View>
              <Text style={[styles.actionText, { color: colors.text }]}>Transfer</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.actionBtn}>
              <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
                 <MaterialIcons name="qr-code-scanner" size={26} color={common.danger} />
              </View>
              <Text style={[styles.actionText, { color: colors.text }]}>Scan QR</Text>
           </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: 20, paddingTop: 30 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Withdraw Funds</Text>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Amount (PHP)</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
               <Text style={[styles.currencyPrefix, { color: colors.textSecondary }]}>₱</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
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
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontWeight: '600',
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '800',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardNumber: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cardHolder: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
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
});
