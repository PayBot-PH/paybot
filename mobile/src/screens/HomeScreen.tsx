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
  Animated,
  Alert,
} from 'react-native';
import { useQuery } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { API_URL } from '../config';
import { useTheme } from '../theme';

const { width } = Dimensions.get('window');

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
      `${API_URL}/pos-terminals/${terminalId}/transactions?per_page=10`,
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
};

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

const TerminalCard = ({ terminal, onPress, isSelected }) => {
  const { colors, common, shadows, roundness } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.terminalCard,
        {
          backgroundColor: isSelected ? (useTheme().isDark ? '#1E293B' : '#F0F9FF') : colors.card,
          borderColor: isSelected ? common.primary : colors.border,
          borderRadius: roundness.lg,
          ...shadows.sm
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.terminalHeader}>
        <View style={styles.terminalInfo}>
          <Text style={[styles.terminalName, { color: colors.text }]}>{terminal.terminal_name}</Text>
          <Text style={[styles.terminalCode, { color: colors.textSecondary }]}>ID: {terminal.terminal_code}</Text>
          {terminal.is_t0_settlement && (
            <View style={[styles.t0Badge, { backgroundColor: '#FEF3C7' }]}>
              <MaterialIcons name="bolt" size={12} color="#D97706" />
              <Text style={styles.t0Text}>ULTRA SETTLEMENT</Text>
            </View>
          )}
        </View>
        <StatusBadge status={terminal.is_active ? 'active' : 'inactive'} />
      </View>

      <View style={styles.methodsList}>
        {terminal.enabled_payment_methods.slice(0, 3).map((method, idx) => (
          <View key={idx} style={[styles.methodBadge, { backgroundColor: colors.surface }]}>
            <Text style={[styles.methodText, { color: common.primary }]}>{method.toUpperCase()}</Text>
          </View>
        ))}
        {terminal.enabled_payment_methods.length > 3 && (
          <Text style={[styles.moreText, { color: colors.textSecondary }]}>+{terminal.enabled_payment_methods.length - 3}</Text>
        )}
      </View>

      {isSelected && (
        <View style={styles.selectionIndicator}>
          <MaterialIcons name="check-circle" size={24} color={common.primary} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const TransactionItem = ({ transaction }) => {
  const { colors, common, roundness } = useTheme();
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return 'check-circle';
      case 'pending': return 'access-time';
      case 'failed': return 'cancel';
      default: return 'help-outline';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return common.success;
      case 'pending': return common.warning;
      case 'failed': return common.danger;
      default: return colors.textSecondary;
    }
  };

  return (
    <View style={[styles.transactionItem, { backgroundColor: colors.surface, borderRadius: roundness.md }]}>
      <View style={[styles.transactionIconContainer, { backgroundColor: colors.background }]}>
        <MaterialIcons
          name={getStatusIcon(transaction.status)}
          size={22}
          color={getStatusColor(transaction.status)}
        />
      </View>

      <View style={styles.transactionInfo}>
        <Text style={[styles.transactionDesc, { color: colors.text }]} numberOfLines={1}>{transaction.description}</Text>
        <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
          {new Date(transaction.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      <View style={styles.transactionRight}>
        <Text style={[styles.transactionAmount, { color: colors.text }]}>₱{(transaction.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
      </View>
    </View>
  );
};

const NavButton = ({ icon, label, onPress, color }) => {
  const { colors, roundness } = useTheme();
  return (
    <TouchableOpacity style={styles.navBtnItem} onPress={onPress}>
       <View style={[styles.navBtnIcon, { backgroundColor: color + '15', borderRadius: roundness.md }]}>
          <MaterialIcons name={icon} size={26} color={color} />
       </View>
       <Text style={[styles.navBtnLabel, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
};

export const HomeScreen = ({ navigation }) => {
  const { colors, common, isDark } = useTheme();
  const [token, setToken] = useState(null);
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const scrollY = new Animated.Value(0);

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
      onSuccess: (data) => {
        if (data?.data?.length > 0 && !selectedTerminal) {
          setSelectedTerminal(data.data[0]);
        }
      }
    }
  );

  const transactionsQuery = useQuery(
    ['transactions', selectedTerminal?.id, token],
    () => api.getTransactions(token, selectedTerminal.id),
    {
      enabled: !!token && !!selectedTerminal,
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

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [220, 140],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.header, { height: headerHeight, backgroundColor: isDark ? colors.surface : common.primary }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>PayBot</Text>
            <View style={styles.statusRow}>
               <View style={styles.statusDot} />
               <Text style={styles.headerSubtitle}>LIVE PRODUCTION</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.profileBtn}>
             <MaterialIcons name="notifications-none" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.navButtonsRow}>
           <NavButton icon="receipt-long" label="History" onPress={() => navigation.navigate('Transactions')} color="#F59E0B" />
           <NavButton icon="account-balance-wallet" label="Wallet" onPress={() => navigation.navigate('Wallet')} color="#10B981" />
           <NavButton icon="settings" label="Settings" onPress={() => navigation.navigate('Settings')} color="#6366F1" />
           <NavButton icon="support-agent" label="Support" onPress={() => Alert.alert('Support', 'Connecting to PayBot Support Agent...')} color="#EC4899" />
        </View>
      </Animated.View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={common.primary}
          />
        }
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Active Terminals</Text>
            <TouchableOpacity onPress={() => terminalsQuery.refetch()}>
              <MaterialIcons name="refresh" size={20} color={common.primary} />
            </TouchableOpacity>
          </View>

          {terminalsQuery.isLoading && !terminalsQuery.data ? (
            <ActivityIndicator size="large" color={common.primary} style={{ marginVertical: 20 }} />
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
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.terminalsList}
            />
          ) : (
            <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
              <MaterialIcons name="devices" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyStateText, { color: colors.text }]}>No terminals found</Text>
            </View>
          )}
        </View>

        {selectedTerminal && (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: common.primary }]}
              onPress={() =>
                navigation.navigate('CreateTransaction', {
                  terminal: selectedTerminal,
                })
              }
              activeOpacity={0.8}
            >
              <View style={styles.createButtonIcon}>
                 <MaterialIcons name="add-shopping-cart" size={26} color="#fff" />
              </View>
              <Text style={styles.createButtonText}>Create New Payment</Text>
              <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Orders</Text>
            {selectedTerminal && (
               <Text style={[styles.terminalIndicator, { color: colors.textSecondary }]}>
                 {selectedTerminal.terminal_name}
               </Text>
            )}
          </View>

          {transactionsQuery.isLoading && !transactionsQuery.data ? (
            <ActivityIndicator size="large" color={common.primary} style={{ marginVertical: 20 }} />
          ) : transactionsQuery.data?.data?.length > 0 ? (
            <View style={styles.transactionsList}>
              {transactionsQuery.data.data.map((item) => (
                <TransactionItem key={item.id} transaction={item} />
              ))}
              <TouchableOpacity
                style={[styles.viewAllBtn, { backgroundColor: colors.surface, borderRadius: roundness.md }]}
                onPress={() => navigation.navigate('Transactions')}
                activeOpacity={0.6}
              >
                 <Text style={[styles.viewAllText, { color: common.primary }]}>View All Transactions</Text>
                 <MaterialIcons name="arrow-forward" size={18} color={common.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
              <MaterialIcons name="receipt" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyStateText, { color: colors.text }]}>No transactions yet</Text>
            </View>
          )}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingTop: 16,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    marginBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  profileBtn: {
     width: 44,
     height: 44,
     borderRadius: 22,
     backgroundColor: 'rgba(255,255,255,0.2)',
     alignItems: 'center',
     justifyContent: 'center',
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  terminalIndicator: {
     fontSize: 12,
     fontWeight: '600',
  },
  terminalsList: {
    paddingLeft: 24,
    paddingRight: 12,
  },
  terminalCard: {
    width: width * 0.7,
    padding: 20,
    marginRight: 12,
    borderWidth: 1,
    height: 160,
    justifyContent: 'space-between',
  },
  terminalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  terminalInfo: {
    flex: 1,
  },
  terminalName: {
    fontSize: 18,
    fontWeight: '800',
  },
  terminalCode: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  t0Badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  t0Text: {
    fontSize: 10,
    fontWeight: '900',
    color: '#92400E',
    marginLeft: 4,
  },
  methodsList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  methodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  methodText: {
    fontSize: 10,
    fontWeight: '800',
  },
  moreText: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectionIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  actionContainer: {
     paddingHorizontal: 24,
     marginTop: 24,
  },
  createButton: {
    flexDirection: 'row',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginLeft: 12,
  },
  transactionsList: {
    paddingHorizontal: 24,
    gap: 12,
    paddingBottom: 24,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  transactionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDesc: {
    fontSize: 15,
    fontWeight: '700',
  },
  transactionDate: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    marginHorizontal: 24,
    borderRadius: 20,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 8,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '800',
    marginRight: 8,
  },
  navButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 10,
  },
  navBtnItem: {
    alignItems: 'center',
    width: (width - 48) / 4,
  },
  navBtnIcon: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  navBtnLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  }
});
