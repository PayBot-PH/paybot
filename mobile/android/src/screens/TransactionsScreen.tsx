import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useQuery } from 'react-query';
import { terminalApi } from '../api/terminal';
import { Config } from '../Config';
import { Strings } from '../strings';

const COLORS = {
  primary: '#3B82F6',
  secondary: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  dark: '#111827',
  light: '#F3F4F6',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
};

const TransactionItem = ({ item }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return COLORS.secondary;
      case 'pending': return COLORS.warning;
      case 'failed': return COLORS.danger;
      default: return COLORS.textSecondary;
    }
  };

  return (
    <View style={styles.item}>
      <View style={styles.left}>
        <View style={[styles.iconContainer, { backgroundColor: getStatusColor(item.status) + '20' }]}>
           <MaterialIcons
             name={item.status === 'completed' ? 'check' : item.status === 'pending' ? 'access-time' : 'close'}
             size={20}
             color={getStatusColor(item.status)}
           />
        </View>
        <View>
          <Text style={styles.desc}>{item.description || Strings.history.posSale}</Text>
          <Text style={styles.date}>
            {new Date(item.created_at).toLocaleDateString()} • {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.amount}>₱{(item.amount / 100).toFixed(2)}</Text>
        <Text style={[styles.method, { color: COLORS.textSecondary }]}>{item.payment_method.toUpperCase()}</Text>
      </View>
    </View>
  );
};

export const TransactionsScreen = () => {
  const [token, setToken] = useState(null);
  const [terminalId, setTerminalId] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      const storedToken = await AsyncStorage.getItem('auth_token');
      setToken(storedToken);
    };
    loadData();
  }, []);

  const terminalsQuery = useQuery(
    ['terminals', token],
    () => terminalApi.getTerminals(),
    { enabled: !!token }
  );

  useEffect(() => {
    if (terminalsQuery.data?.data?.length > 0) {
      setTerminalId(terminalsQuery.data.data[0].id);
    }
  }, [terminalsQuery.data]);

  const transactionsQuery = useQuery(
    ['allTransactions', terminalId, token],
    () => terminalApi.getTransactions(terminalId),
    { enabled: !!token && !!terminalId }
  );

  const onRefresh = () => {
    transactionsQuery.refetch();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>{Strings.history.title}</Text>
        <Text style={styles.subtitle}>{Strings.history.subtitle}</Text>
      </View>

      {transactionsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : transactionsQuery.data?.data?.length > 0 ? (
        <FlatList
          data={transactionsQuery.data.data}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <TransactionItem item={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={transactionsQuery.isFetching} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        />
      ) : (
        <View style={styles.center}>
          <MaterialIcons name="receipt-long" size={64} color={COLORS.border} />
          <Text style={styles.emptyText}>{Strings.history.empty}</Text>
        </View>
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
    padding: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  list: {
    paddingBottom: 20,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  desc: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  date: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  method: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
});
