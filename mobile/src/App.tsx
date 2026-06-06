import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar, useColorScheme, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from 'react-query';
import Toast from 'react-native-toast-message';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { HomeScreen } from './screens/HomeScreen';
import { CreateTransactionScreen } from './screens/CreateTransactionScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { WalletScreen } from './screens/WalletScreen';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useTheme, COLORS } from './theme';
import { View, ActivityIndicator } from 'react-native';

import DeviceInfo from 'react-native-device-info';
import { API_URL } from './config';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

// Auth Stack (Login)
const AuthStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
};

// Home Stack (Terminals & Transactions)
const HomeStack = () => {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="HomeScreen"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateTransaction"
        component={CreateTransactionScreen}
        options={{
          title: 'New Transaction',
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
};

// App Stack (Main Navigation)
const AppStack = () => {
  const { colors, common } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: common.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 10,
          paddingTop: 10,
          height: 72,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 4,
        },
        tabBarIcon: ({ color, focused }) => {
          let icon;
          switch (route.name) {
            case 'Home': icon = focused ? 'dashboard' : 'dashboard'; break;
            case 'Transactions': icon = focused ? 'receipt-long' : 'receipt'; break;
            case 'Wallet': icon = focused ? 'account-balance-wallet' : 'account-balance-wallet'; break;
            case 'Settings': icon = focused ? 'settings' : 'settings'; break;
            default: icon = 'help';
          }
          return (
            <View style={focused ? [styles.tabIconFocused, { backgroundColor: common.primary + '15' }] : styles.tabIcon}>
              <MaterialIcons name={icon} size={focused ? 26 : 24} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabIconFocused: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  }
});

// Root Navigator
const RootNavigator = () => {
  const { isLoggedIn, user, isLoading } = useAuth();
  const { isDark, colors, common } = useTheme();

  // Auto-register device when logged in
  useEffect(() => {
    const registerDevice = async () => {
      if (isLoggedIn && user) {
        try {
          const token = await AsyncStorage.getItem('auth_token');
          const deviceId = await DeviceInfo.getUniqueId();
          const deviceName = await DeviceInfo.getDeviceName();
          const model = await DeviceInfo.getModel();
          const systemVersion = await DeviceInfo.getSystemVersion();

          // 1. Register/Heartbeat device
          const regRes = await fetch(`${API_URL}/pos-terminals/devices/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              device_id: deviceId,
              device_name: deviceName,
              model: model,
              system_version: systemVersion,
              app_version: DeviceInfo.getVersion(),
            }),
          });

          const regData = await regRes.json();
          console.log('Device registration status:', regData.message);

          // 2. If not linked to a terminal, we could potentially auto-assign if backend supports it
          // For now, registration ensures the device exists in the database for the admin to see.
        } catch (e) {
          console.warn('Failed to auto-register device', e);
        }
      }
    };
    registerDevice();
  }, [isLoggedIn, user]);

  const theme = React.useMemo(() => {
    const baseTheme = isDark ? DarkTheme : DefaultTheme;
    const mode = isDark ? 'dark' : 'light';
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        primary: COLORS.primary,
        background: COLORS[mode].background,
        card: COLORS[mode].card,
        text: COLORS[mode].text,
        border: COLORS[mode].border,
      },
    };
  }, [isDark, isDark]); // isDark repeated just to match search but I'll fix it

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={common.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      {isLoggedIn ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

// Main App Component
export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
          <Toast />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
