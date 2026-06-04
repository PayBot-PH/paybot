import React from 'react';
import { StatusBar, useColorScheme, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from 'react-query';
import Toast from 'react-native-toast-message';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { HomeScreen } from './screens/HomeScreen';
import { CreateTransactionScreen } from './screens/CreateTransactionScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { WalletScreen } from './screens/WalletScreen';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useTheme, COLORS } from './theme';

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
  const { isLoggedIn } = useAuth();
  const { isDark, colors } = useTheme();

  const MyDefaultTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: COLORS.primary,
      background: COLORS.light.background,
      card: COLORS.light.card,
      text: COLORS.light.text,
      border: COLORS.light.border,
    },
  };

  const MyDarkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: COLORS.primary,
      background: COLORS.dark.background,
      card: COLORS.dark.card,
      text: COLORS.dark.text,
      border: COLORS.dark.border,
    },
  };

  return (
    <NavigationContainer theme={isDark ? MyDarkTheme : MyDefaultTheme}>
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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootNavigator />
        <Toast />
      </AuthProvider>
    </QueryClientProvider>
  );
}
