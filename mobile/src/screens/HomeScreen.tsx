import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useQuery } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Toast from 'react-native-toast-message';
import { API_URL } from '../config';

const { width } = Dimensions.get('window');

const COLORS = {
  primary: '#0EA5E9',
  secondary: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  dark: '#0F172A',
  light: '#F8FAFC',
  text: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  success: '#10B981',
};

const api = {
  getTerminals: async (token) => {
    const response = await fetch(`${API_URL}/pos-terminals/`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error('Failed to fetch terminals');
    return response.json();
  },

  getTransactions: async (token, terminalId) => {
    const response = await fetch(
      `${API_URL}/pos-terminals/${terminalId}/transactions?per_page=20`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!response.ok) throw new Error('Failed to fetch transactions');
    return response.json();
  },

  createTransaction: async (token, terminalId, data) => {
    const response = await fetch(
      `${API_URL}/pos-terminals/${terminalId}/transactions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );
    if (!response.ok) throw new Error('Failed to create transaction');
    return response.json();
  },
};

// Status Badge Component
const StatusBadge = ({ status }) => {
  const statusColors = {
    active: { bg: '#D1FAE5', text: '#065F46' },
    inactive: { bg: '#F3F4F6', text: '#374151' },
    completed: { bg: '#D1FAE5', text: '#065F46' },
    pending: { bg: '#FEF3C7', text: '#92400E' },
    failed: { bg: '#FEE2E2', text: '#991B1B' },
  };

  const colors = statusColors[status] || { bg: '#F3F4F6', text: '#374151' };

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
};

// Terminal Card Component
const TerminalCard = ({ terminal, onPress, isSelected }) => {
  return (
    <TouchableOpacity
      style={[
        styles.terminalCard,
        isSelected && styles.terminalCardSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.terminalHeader}>
        <View style={styles.terminalInfo}>
          <Text style={styles.terminalName}>{terminal.terminal_name}</Text>
          <Text style={styles.terminalCode}>Code: {terminal.terminal_code}</Text>
          {terminal.is_t0_settlement && (
            <View style={styles.t0Badge}>
              <MaterialIcons name="bolt" size={14} color="#D97706" />
              <Text style={styles.t0Text}>T0 Settlement</Text>
            </View>
          )}
        </View>
        <StatusBadge status={terminal.is_active ? 'active' : 'inactive'} />
      </View>

      {terminal.location && (
        <Text style={styles.terminalLocation}>📍 {terminal.location}</Text>
      )}

      <View style={styles.methodsContainer}>
        <Text style={styles.methodsLabel}>Payment Methods:</Text>
        <View style={styles.methodsList}>
          {terminal.enabled_payment_methods.map((method, idx) => (
            <View key={idx} style={styles.methodBadge}>
              <Text style={styles.methodText}>{method.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </View>

      {isSelected && (
        <View style={styles.selectionIndicator}>
          <MaterialIcons name="check-circle" size={24} color={COLORS.primary} />
        </View>
      )}
    </TouchableOpacity>
  );
};

// Transaction List Item
const TransactionItem = ({ transaction }) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return 'check-circle';
      case 'pending':
        return 'access-time';
      case 'failed':
        return 'cancel';
      default:
        return 'help-outline';
    }
  };

  return (
    <View style={styles.transactionItem}>
      <View style={styles.transactionLeft}>
        <MaterialIcons
          name={getStatusIcon(transaction.status)}
          size={24}
          color={
            transaction.status === 'completed'
              ? COLORS.success
              : transaction.status === 'pending'
              ? COLORS.warning
              : COLORS.danger
          }
        />
      </View>

      <View style={styles.transactionInfo}>
        <Text style={styles.transactionDesc}>{transaction.description}</Text>
        <Text style={styles.transactionDate}>
          {new Date(transaction.created_at).toLocaleDateString()} •{' '}
          {new Date(transaction.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>

      <View style={styles.transactionRight}>
        <Text style={styles.transactionAmount}>₱{(transaction.amount / 100).toFixed(2)}</Text>
        <StatusBadge status={transaction.status} />
      </View>
    </View>
  );
};

// Home Screen
export const HomeScreen = ({ navigation }) => {
  const [token, setToken] = useState(null);
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const loadToken = async () => {
      const storedToken = await AsyncStorage.getItem('auth_token');
      setToken(storedToken);
    };
    loadToken();
  }, []);

  const terminalsQuery = useQuery(
    ['terminals', token],
    () => api.getTerminals(token),
    {
      enabled: !!token,
      staleTime: 5 * 60 * 1000,
    }
  );

  const transactionsQuery = useQuery(
    ['transactions', selectedTerminal?.id, token],
    () => api.getTransactions(token, selectedTerminal.id),
    {
      enabled: !!token && !!selectedTerminal,
      staleTime: 2 * 60 * 1000,
    }
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      terminalsQuery.refetch(),
      transactionsQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.dark} />

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>POS Terminal</Text>
          <Text style={styles.headerSubtitle}>Accept payments on the go</Text>
        </View>

        {/* Terminals Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Terminals</Text>
            {terminalsQuery.isLoading && <ActivityIndicator color={COLORS.primary} />}
          </View>

          {terminalsQuery.isLoading && !terminalsQuery.data ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
          ) : terminalsQuery.data?.data?.length > 0 ? (
            <FlatList
              data={terminalsQuery.data.data}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TerminalCard
                  terminal={item}
                  onPress={() => setSelectedTerminal(item)}
                  isSelected={selectedTerminal?.id === item.id}
                />
              )}
              scrollEnabled={false}
            />
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="devices" size={48} color={COLORS.textSecondary} />
              <Text style={styles.emptyStateText}>No terminals assigned yet</Text>
              <Text style={styles.emptyStateSubtext}>Contact your admin to request a terminal</Text>
            </View>
          )}
        </View>

        {/* Create Transaction */}
        {selectedTerminal && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={() =>
              navigation.navigate('CreateTransaction', {
                terminal: selectedTerminal,
              })
            }
          >
            <MaterialIcons name="add" size={24} color="#fff" />
            <Text style={styles.createButtonText}>Create Payment Order</Text>
          </TouchableOpacity>
        )}

        {/* Recent Transactions */}
        {selectedTerminal && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              {transactionsQuery.isLoading && <ActivityIndicator color={COLORS.primary} />}
            </View>

            {transactionsQuery.isLoading && !transactionsQuery.data ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
            ) : transactionsQuery.data?.data?.length > 0 ? (
              <FlatList
                data={transactionsQuery.data.data}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => <TransactionItem transaction={item} />}
                scrollEnabled={false}
              />
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="receipt" size={48} color={COLORS.textSecondary} />
                <Text style={styles.emptyStateText}>No transactions yet</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
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
    paddingBottom: 20,
  },
  header: {
    backgroundColor: COLORS.dark,
    padding: 24,
    paddingTop: 10,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  terminalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  terminalCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#F0F9FF',
    borderWidth: 2,
  },
  terminalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  terminalInfo: {
    flex: 1,
  },
  terminalName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  terminalCode: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  t0Badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  t0Text: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#D97706',
    marginLeft: 2,
  },
  terminalLocation: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  methodsContainer: {
    marginTop: 8,
  },
  methodsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  methodsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodBadge: {
    backgroundColor: COLORS.light,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  methodText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  selectionIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  createButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.light,
    marginBottom: 10,
    borderRadius: 10,
  },
  transactionLeft: {
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  transactionDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
});
