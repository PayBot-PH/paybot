import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useQuery } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { API_URL } from '../config';
import { useTheme } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const api = {
  getTransactions: async (token) => {
    const response = await fetch(`${API_URL}/wallet/transactions`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to fetch transactions');
    return response.json();
  },
};

export const TransactionsScreen = () => {
  const { colors, common, shadows, roundness } = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const loadToken = async () => {
      const storedToken = await AsyncStorage.getItem('auth_token');
      setToken(storedToken);
    };
    loadToken();
  }, []);

  const { data, isLoading, refetch } = useQuery(['wallet-transactions', token], () => api.getTransactions(token), {
    enabled: !!token,
  });

  const filteredData = data?.items?.filter(item => {
    const isIncome = ['terminal_sale', 'top_up', 'credit'].includes(item.transaction_type) || (item.amount > 0 && item.transaction_type === 'adjustment');
    const isExpense = ['withdraw', 'disbursement', 'debit'].includes(item.transaction_type) || (item.amount < 0 && item.transaction_type === 'adjustment');

    if (filter === 'all') return true;
    if (filter === 'income') return isIncome;
    if (filter === 'expense') return isExpense;
    return true;
  }) || [];

  const renderItem = ({ item, index }: { item: any, index: number }) => {
    const isNegative = ['withdraw', 'disbursement', 'debit'].includes(item.transaction_type) || (item.amount < 0 && item.transaction_type === 'adjustment');

    return (
      <TouchableOpacity
        style={[
          styles.item,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: roundness.md,
            ...shadows.sm
          }
        ]}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: isNegative ? '#FEE2E2' : '#D1FAE5' }]}>
          <MaterialIcons
            name={isNegative ? 'call-made' : 'call-received'}
            size={22}
            color={isNegative ? common.danger : common.success}
          />
        </View>
        <View style={styles.left}>
          <Text style={[styles.desc, { color: colors.text }]} numberOfLines={1}>
            {item.note || item.transaction_type.replace('_', ' ').toUpperCase()}
          </Text>
          <View style={styles.subLeft}>
            <Text style={[styles.date, { color: colors.textSecondary }]}>
              {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {item.reference_id && (
              <Text style={[styles.refText, { color: colors.textSecondary }]}>
                #{item.reference_id.substring(0, 8)}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amount, { color: isNegative ? common.danger : common.success }]}>
            {isNegative ? '-' : '+'}₱{Math.abs(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
          <View style={[
            styles.statusBadge,
            {
              backgroundColor: item.status === 'completed' ? '#D1FAE5' : '#FEF3C7',
            }
          ]}>
            <Text style={[styles.statusText, { color: item.status === 'completed' ? '#065F46' : '#92400E' }]}>
              {item.status?.toUpperCase()}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const FilterButton = ({ label, value }: { label: string, value: string }) => (
    <TouchableOpacity
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setFilter(value);
      }}
      style={[
        styles.filterBtn,
        {
          backgroundColor: filter === value ? common.primary : colors.surface,
          borderColor: filter === value ? common.primary : colors.border
        }
      ]}
    >
      <Text style={[
        styles.filterText,
        { color: filter === value ? '#fff' : colors.textSecondary }
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Activity</Text>
        <View style={styles.filterContainer}>
          <FilterButton label="All" value="all" />
          <FilterButton label="Income" value="income" />
          <FilterButton label="Expenses" value="expense" />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={common.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={common.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconCircle, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="receipt-long" size={48} color={colors.textSecondary} />
              </View>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No transactions yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 16,
  },
  filterContainer: {
    flexDirection: 'row',
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  left: {
    flex: 1,
  },
  desc: {
    fontSize: 16,
    fontWeight: '700',
  },
  date: {
    fontSize: 12,
    marginTop: 4,
  },
  subLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refText: {
    fontSize: 10,
    marginTop: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 4,
    borderRadius: 4,
    fontWeight: '700',
  },
  right: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 17,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
