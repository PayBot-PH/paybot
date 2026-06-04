import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { API_URL } from '../config';

const COLORS = {
  primary: '#0EA5E9',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  text: '#0F172A',
  textSecondary: '#64748B',
  light: '#F8FAFC',
};

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
  const [token, setToken] = useState<string | null>(null);

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

  const renderItem = ({ item }: { item: any }) => {
    const isNegative = item.amount < 0 || item.transaction_type === 'withdraw' || item.transaction_type === 'disbursement';

    return (
      <View style={styles.item}>
        <View style={styles.iconContainer}>
          <MaterialIcons
            name={isNegative ? 'arrow-upward' : 'arrow-downward'}
            size={24}
            color={isNegative ? COLORS.danger : COLORS.success}
          />
        </View>
        <View style={styles.left}>
          <Text style={styles.desc}>{item.note || item.transaction_type.replace('_', ' ').toUpperCase()}</Text>
          <Text style={styles.date}>
            {new Date(item.created_at).toLocaleDateString()} • {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amount, { color: isNegative ? COLORS.danger : COLORS.success }]}>
            {isNegative ? '-' : '+'}₱{Math.abs(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: item.status === 'completed' ? '#D1FAE5' : '#FEF3C7' }]}>
            <Text style={[styles.statusText, { color: item.status === 'completed' ? '#065F46' : '#92400E' }]}>
              {item.status?.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Transaction History</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="history" size={64} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>No transactions found</Text>
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
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  left: {
    flex: 1,
  },
  desc: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  date: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  right: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 16,
  },
});
