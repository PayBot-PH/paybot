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
} from 'react-native';
import { useQuery, useMutation } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Toast from 'react-native-toast-message';

const COLORS = {
  primary: '#0EA5E9',
  secondary: '#10B981',
  danger: '#EF4444',
  text: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  light: '#F8FAFC',
};

const api = {
  getBalance: async (token) => {
    const response = await fetch('https://paybot-production-7350.up.railway.app/api/v1/wallet/balance', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to fetch balance');
    return response.json();
  },
  withdraw: async (token, data) => {
    const response = await fetch('https://paybot-production-7350.up.railway.app/api/v1/wallet/withdraw', {
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
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={balanceQuery.isLoading}
            onRefresh={() => balanceQuery.refetch()}
            tintColor={COLORS.primary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>My Wallet</Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>
            ₱{balanceQuery.data?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Withdraw Funds</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Amount (PHP)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Bank Name / E-Wallet</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. GCash, Maya, BDO"
              value={bankName}
              onChangeText={setBankName}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Account Number</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter account number"
              keyboardType="numeric"
              value={accountNumber}
              onChangeText={setAccountNumber}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Note (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Add a note"
              value={note}
              onChangeText={setNote}
            />
          </View>

          <TouchableOpacity
            style={styles.withdrawButton}
            onPress={handleWithdraw}
            disabled={withdrawMutation.isLoading}
          >
            {withdrawMutation.isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.withdrawButtonText}>Request Withdrawal</Text>
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
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  balanceCard: {
    backgroundColor: COLORS.primary,
    margin: 20,
    padding: 24,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  balanceLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontWeight: '500',
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    marginTop: 8,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.light,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  withdrawButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  withdrawButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
