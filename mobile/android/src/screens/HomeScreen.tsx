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
} from 'react-native';
import { useQuery } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Toast from 'react-native-toast-message';
import DeviceInfo from 'react-native-device-info';
import { terminalApi } from '../api/terminal';
import { Config } from '../Config';
import { Strings } from '../strings';

const COLORS = {
  primary: '#3B82F6',
  secondary: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  dark: '#1F2937',
  light: '#F3F4F6',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  success: '#10B981',
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
  const [isDeviceLinked, setIsDeviceLinked] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [deviceId, setDeviceId] = useState('');

  const fetchWallet = async () => {
    try {
      const data = await terminalApi.getWalletBalance();
      setWalletBalance(data.balance);
    } catch (err) {
      console.error('Failed to fetch wallet', err);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      const storedToken = await AsyncStorage.getItem('auth_token');
      setToken(storedToken);

      const id = await DeviceInfo.getUniqueId();
      setDeviceId(id);

      try {
        const registration = await terminalApi.registerDevice();
        if (registration.success && registration.data) {
          setIsDeviceLinked(registration.data.is_linked);
        }
      } catch (err) {
        console.error('Heartbeat failed', err);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (token) fetchWallet();
  }, [token]);

  const terminalsQuery = useQuery(
    ['terminals', token],
    () => terminalApi.getTerminals(),
    {
      enabled: !!token,
      staleTime: 5 * 60 * 1000,
    }
  );

  const transactionsQuery = useQuery(
    ['transactions', selectedTerminal?.id, token],
    () => terminalApi.getTransactions(selectedTerminal?.id),
    {
      enabled: !!token && !!selectedTerminal?.id,
      staleTime: 2 * 60 * 1000,
    }
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        terminalsQuery.refetch(),
        transactionsQuery.refetch(),
        fetchWallet(),
        (async () => {
          const reg = await terminalApi.registerDevice();
          if (reg.success && reg.data) setIsDeviceLinked(reg.data.is_linked);
        })()
      ]);
    } catch (e) {
      console.error('Refresh failed', e);
    } finally {
      setRefreshing(false);
    }
  }, [terminalsQuery, transactionsQuery]);

  useEffect(() => {
    if (terminalsQuery.data?.data?.length === 1 && !selectedTerminal) {
      setSelectedTerminal(terminalsQuery.data.data[0]);
    }
  }, [terminalsQuery.data, selectedTerminal]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.dark} />

      {!isDeviceLinked ? (
        <View style={styles.waitingContainer}>
          <MaterialIcons name="app-registration" size={80} color={COLORS.primary} />
          <Text style={styles.waitingTitle}>{Strings.home.waitingAssignment}</Text>
          <Text style={styles.waitingSubtitle}>
            {Strings.home.waitingSubtitle}
          </Text>

          <View style={styles.deviceIdBox}>
             <Text style={styles.deviceIdLabel}>DEVICE ID</Text>
             <Text style={styles.deviceIdText}>{deviceId}</Text>
          </View>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={async () => {
              const registration = await terminalApi.registerDevice();
              if (registration.success && registration.data?.is_linked) {
                setIsDeviceLinked(true);
                terminalsQuery.refetch();
              } else {
                Toast.show({ type: 'info', text1: Strings.home.stillWaiting });
              }
            }}
          >
            <Text style={styles.refreshButtonText}>{Strings.common.checkStatus}</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
            <View style={styles.headerTop}>
               <View>
                 <Text style={styles.headerTitle}>{Config.APP_NAME}</Text>
                 <Text style={styles.headerSubtitle}>{Strings.home.headerSubtitle}</Text>
               </View>
               <View style={styles.walletHeader}>
                 <Text style={styles.walletLabel}>{Strings.home.walletBalance}</Text>
                 <Text style={styles.walletValue}>₱{walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
               </View>
            </View>
          </View>

          {/* Setup Guide - only show if no terminals or for new users */}
          {!selectedTerminal && (
            <View style={styles.guideCard}>
              <View style={styles.guideHeader}>
                <MaterialIcons name="security" size={24} color={COLORS.primary} />
                <Text style={styles.guideTitle}>{Strings.guide.activateTitle}</Text>
              </View>
              <Text style={styles.guideText}>
                {Strings.guide.activateText}
              </Text>
              <View style={styles.guideStep}>
                <Text style={styles.stepNum}>1</Text>
                <Text style={styles.stepText}>{Strings.guide.step1}</Text>
              </View>
              <View style={styles.guideStep}>
                <Text style={styles.stepNum}>2</Text>
                <Text style={styles.stepText}>{Strings.guide.step2}</Text>
              </View>
              <View style={styles.guideStep}>
                <Text style={styles.stepNum}>3</Text>
                <Text style={styles.stepText}>{Strings.guide.step3}</Text>
              </View>
              <TouchableOpacity
                style={styles.guideButton}
                onPress={() => Toast.show({ type: 'info', text1: 'Settings', text2: 'Please configure these in your Railway Dashboard.' })}
              >
                <Text style={styles.guideButtonText}>{Strings.guide.viewSetup}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Terminals Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{Strings.home.yourTerminals}</Text>
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
                <Text style={styles.emptyStateText}>{Strings.home.noTerminals}</Text>
                <Text style={styles.emptyStateSubtext}>{Strings.home.noTerminalsSub}</Text>
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
              <Text style={styles.createButtonText}>{Strings.home.createPayment}</Text>
            </TouchableOpacity>
          )}

          {/* Recent Transactions */}
          {selectedTerminal && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{Strings.home.recentTransactions}</Text>
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
                  <Text style={styles.emptyStateText}>{Strings.home.noTransactions}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
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
    padding: 20,
    paddingTop: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletHeader: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 10,
    borderRadius: 12,
  },
  walletLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  walletValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  terminalCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#F0F7FF',
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
  guideCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  guideTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginLeft: 8,
  },
  guideText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 20,
    marginRight: 8,
  },
  stepText: {
    fontSize: 13,
    color: COLORS.text,
  },
  bold: {
    fontWeight: 'bold',
  },
  guideButton: {
    marginTop: 15,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  guideButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  code: {
    fontFamily: 'monospace',
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  waitingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  waitingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginTop: 24,
    textAlign: 'center',
  },
  waitingSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 24,
  },
  deviceIdBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  deviceIdLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  deviceIdText: {
    fontSize: 16,
    fontFamily: 'monospace',
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  refreshButton: {
    marginTop: 32,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
