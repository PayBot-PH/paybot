import React from 'react';
import { View, ActivityIndicator, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { enableScreens } from 'react-native-screens';
import { terminalApi } from './api/terminal';

enableScreens();

export const AuthContext = React.createContext();

import { HomeScreen } from './screens/HomeScreen';
import { CreateTransactionScreen } from './screens/CreateTransactionScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { PinLockScreen } from './screens/PinLockScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

const COLORS = {
  primary: '#3B82F6',
  text: '#111827',
  textSecondary: '#6B7280',
  light: '#F3F4F6',
};

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
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="HomeScreen" component={HomeScreen} />
      <Stack.Screen
        name="CreateTransaction"
        component={CreateTransactionScreen}
      />
    </Stack.Navigator>
  );
};

// App Stack (Main Navigation)
const AppStack = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: COLORS.light,
          borderTopWidth: 1,
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarLabel: () => null,
        tabBarIcon: ({ color, size }) => {
          return <View style={{ width: size, height: size, backgroundColor: color, borderRadius: size / 2 }} />;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          title: 'Home',
        }}
      />
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{
          title: 'Transactions',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
};

// Root Navigator
const RootNavigator = ({ isLoggedIn }) => {
  return (
    <NavigationContainer>
      {isLoggedIn ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

// Main App Component
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDeviceLinked, setIsDeviceLinked] = React.useState(false);
  const [terminalId, setTerminalId] = React.useState(null);
  const [isLocked, setIsLocked] = React.useState(false);

  const authContext = React.useMemo(() => ({
    signIn: async (token) => {
      await AsyncStorage.setItem('auth_token', token);
      setIsLoggedIn(true);
    },
    signOut: async () => {
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('terminal_id');
      await AsyncStorage.removeItem('has_pin');
      setIsLoggedIn(false);
      setIsLocked(false);
    },
  }), []);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && isLoggedIn) {
        const hasPin = await AsyncStorage.getItem('has_pin');
        if (hasPin === 'true') {
          setIsLocked(true);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isLoggedIn]);

  React.useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const token = await AsyncStorage.getItem('auth_token');
        setIsLoggedIn(!!token);

        // Register device on startup
        const registration = await terminalApi.registerDevice();
        console.log('Device Registration:', registration);

        if (registration.success && registration.data) {
          setIsDeviceLinked(registration.data.is_linked);
          setTerminalId(registration.data.terminal_id);
          // If we have a terminal ID and it has a PIN, lock it initially
          const hasPin = await AsyncStorage.getItem('has_pin');
          if (token && hasPin === 'true') {
            setIsLocked(true);
          }
        }
      } catch (e) {
        console.log('Failed during startup:', e);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapAsync();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (isLocked) {
    return (
      <AuthContext.Provider value={authContext}>
        <PinLockScreen
          onUnlock={() => setIsLocked(false)}
          onLogout={() => authContext.signOut()}
        />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={authContext}>
      <QueryClientProvider client={queryClient}>
        <RootNavigator isLoggedIn={isLoggedIn} />
        <Toast />
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
