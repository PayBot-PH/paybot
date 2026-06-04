import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Keyboard,
  TouchableWithoutFeedback,
  Modal,
  Dimensions,
  Platform,
} from 'react-native';
import { useMutation } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useForm, Controller } from 'react-hook-form';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Toast from 'react-native-toast-message';
import { WebView } from 'react-native-webview';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../theme';
import { API_URL } from '../config';

const { width, height } = Dimensions.get('window');

const PAYMENT_METHODS = [
  { id: 'card', label: 'Tap to Phone', icon: 'contactless', color: '#0EA5E9' },
  { id: 'maya', label: 'Maya QR', icon: 'qr-code-2', color: '#10B981' },
  { id: 'gcash', label: 'GCash', icon: 'account-balance-wallet', color: '#1E40AF' },
  { id: 'grabpay', label: 'GrabPay', icon: 'shopping-bag', color: '#059669' },
];

const api = {
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
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to create transaction');
    }
    return response.json();
  },
};

export const CreateTransactionScreen = ({ route, navigation }) => {
  const { terminal } = route.params;
  const { colors, common, roundness, shadows, isDark } = useTheme();
  const [token, setToken] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [showWebView, setShowWebView] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [qrContent, setQrContent] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [isNfcActive, setIsNfcActive] = useState(false);

  const { control, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      description: '',
      amount: '',
      payment_method: 'card',
    },
  });

  const amount = watch('amount');

  useEffect(() => {
    const loadToken = async () => {
      const storedToken = await AsyncStorage.getItem('auth_token');
      setToken(storedToken);
    };
    loadToken();
  }, []);

  const createMutation = useMutation(
    (data) => api.createTransaction(token, terminal.id, data),
    {
      onSuccess: (data) => {
        if (data.success) {
          setOrderId(data.order_id);
          if (selectedMethod === 'card') {
            setIsNfcActive(true);
            // Simulation
            setTimeout(() => {
              if (data.checkout_url) {
                setCheckoutUrl(data.checkout_url);
                setShowWebView(true);
              } else {
                Toast.show({ type: 'success', text1: 'Card Detected' });
              }
            }, 2500);
          } else if (data.qr_content) {
            setQrContent(data.qr_content);
          } else if (data.checkout_url) {
            setCheckoutUrl(data.checkout_url);
            setShowWebView(true);
          }
        }
      },
      onError: (error) => {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: error.message,
        });
      },
    }
  );

  const onSubmit = (data) => {
    Keyboard.dismiss();
    if (!data.amount || parseFloat(data.amount) <= 0) {
      Toast.show({ type: 'error', text1: 'Enter valid amount' });
      return;
    }

    createMutation.mutate({
      description: data.description || 'Order from ' + terminal.terminal_name,
      amount: parseFloat(data.amount) * 100,
      payment_method: selectedMethod,
    });
  };

  if (isNfcActive) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.nfcContainer}>
          <View style={[styles.nfcRing, { borderColor: common.primary }]}>
             <MaterialIcons name="contactless" size={100} color={common.primary} />
          </View>
          <Text style={[styles.nfcTitle, { color: colors.text }]}>Ready to Tap</Text>
          <Text style={[styles.nfcSubtitle, { color: colors.textSecondary }]}>Hold customer card near the back</Text>
          <View style={styles.nfcAmountBox}>
             <Text style={[styles.nfcAmount, { color: common.primary }]}>₱{parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
          </View>

          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: colors.surface }]}
            onPress={() => setIsNfcActive(false)}
          >
            <Text style={[styles.cancelButtonText, { color: common.danger }]}>Cancel Transaction</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Payment Terminal</Text>
        <View style={{ width: 44 }} />
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={[styles.terminalLabel, { backgroundColor: colors.surface }]}>
             <MaterialIcons name="point-of-sale" size={16} color={common.primary} />
             <Text style={[styles.terminalLabelText, { color: colors.textSecondary }]}>{terminal.terminal_name}</Text>
          </View>

          <View style={styles.section}>
            <Controller
              control={control}
              name="amount"
              render={({ field: { onChange, value } }) => (
                <View style={styles.amountContainer}>
                  <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Amount to Charge</Text>
                  <View style={styles.amountRow}>
                    <Text style={[styles.amountCurrency, { color: common.primary }]}>₱</Text>
                    <TextInput
                      style={[styles.amountInput, { color: colors.text }]}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      value={value}
                      onChangeText={onChange}
                      placeholderTextColor={colors.textSecondary}
                      autoFocus
                    />
                  </View>
                </View>
              )}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Order Note</Text>
            <Controller
              control={control}
              name="description"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder="What is this for?"
                  value={value}
                  onChangeText={onChange}
                  placeholderTextColor={colors.textSecondary}
                />
              )}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Select Method</Text>
            <View style={styles.methodsGrid}>
              {PAYMENT_METHODS.filter(m => terminal.enabled_payment_methods.includes(m.id)).map((method) => (
                <TouchableOpacity
                  key={method.id}
                  style={[
                    styles.methodButton,
                    {
                      backgroundColor: colors.card,
                      borderColor: selectedMethod === method.id ? common.primary : colors.border,
                      borderRadius: roundness.lg
                    },
                    selectedMethod === method.id && { backgroundColor: isDark ? '#1E293B' : '#F0F9FF', borderWidth: 2 }
                  ]}
                  onPress={() => setSelectedMethod(method.id)}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: method.color + '20' }]}>
                    <MaterialIcons
                      name={method.icon}
                      size={28}
                      color={selectedMethod === method.id ? common.primary : method.color}
                    />
                  </View>
                  <Text style={[styles.methodLabel, { color: selectedMethod === method.id ? common.primary : colors.text }]}>
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: common.primary }, createMutation.isLoading && { opacity: 0.7 }]}
            onPress={handleSubmit(onSubmit)}
            disabled={createMutation.isLoading}
          >
            {createMutation.isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.submitButtonText}>Charge ₱{parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
     padding: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { flex: 1, padding: 24 },
  terminalLabel: {
     flexDirection: 'row',
     alignItems: 'center',
     alignSelf: 'center',
     paddingHorizontal: 12,
     paddingVertical: 6,
     borderRadius: 12,
     marginBottom: 32,
  },
  terminalLabelText: {
     fontSize: 12,
     fontWeight: '700',
     marginLeft: 6,
  },
  section: { marginBottom: 32 },
  amountContainer: {
     alignItems: 'center',
  },
  amountLabel: {
     fontSize: 13,
     fontWeight: '700',
     textTransform: 'uppercase',
     marginBottom: 8,
  },
  amountRow: {
     flexDirection: 'row',
     alignItems: 'center',
  },
  amountCurrency: {
     fontSize: 32,
     fontWeight: '800',
     marginRight: 8,
  },
  amountInput: {
     fontSize: 56,
     fontWeight: '900',
     minWidth: 150,
     textAlign: 'center',
  },
  label: { fontSize: 13, fontWeight: '800', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderRadius: 16,
    padding: 18,
    fontSize: 16,
    fontWeight: '600',
    borderWidth: 1,
  },
  methodsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  methodButton: {
    flex: 1,
    minWidth: '45%',
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
  },
  methodIconBox: {
     width: 50,
     height: 50,
     borderRadius: 15,
     alignItems: 'center',
     justifyContent: 'center',
     marginBottom: 12,
  },
  methodLabel: { fontSize: 13, fontWeight: '800' },
  submitButton: {
    borderRadius: 24,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: '800', marginRight: 10 },
  nfcContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  nfcRing: {
     width: 200,
     height: 200,
     borderRadius: 100,
     borderWidth: 4,
     borderStyle: 'dashed',
     alignItems: 'center',
     justifyContent: 'center',
     marginBottom: 40,
  },
  nfcTitle: { fontSize: 28, fontWeight: '900', marginTop: 0 },
  nfcSubtitle: { fontSize: 16, fontWeight: '500', textAlign: 'center', marginTop: 12 },
  nfcAmountBox: {
     backgroundColor: 'rgba(14, 165, 233, 0.1)',
     paddingHorizontal: 24,
     paddingVertical: 12,
     borderRadius: 20,
     marginTop: 40,
  },
  nfcAmount: { fontSize: 32, fontWeight: '900' },
  cancelButton: { marginTop: 60, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16 },
  cancelButtonText: { fontWeight: '800', fontSize: 15 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  content: { flex: 1, padding: 24 },
  section: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 12 },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.light,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencySymbol: { fontSize: 32, fontWeight: '800', color: COLORS.primary, marginRight: 12 },
  amountInput: { flex: 1, fontSize: 36, fontWeight: '800', color: COLORS.text },
  input: {
    backgroundColor: COLORS.light,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
  },
  methodsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  methodButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  methodButtonActive: { borderColor: COLORS.primary, backgroundColor: '#F0F9FF', borderWidth: 2 },
  methodLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginTop: 12 },
  methodLabelActive: { color: COLORS.primary },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    elevation: 4,
  },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 10 },
  nfcContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  nfcTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginTop: 32 },
  nfcSubtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12 },
  nfcAmount: { fontSize: 48, fontWeight: '900', color: COLORS.primary, marginTop: 48 },
  cancelButton: { marginTop: 64, padding: 16 },
  cancelButtonText: { color: COLORS.danger, fontWeight: '700', fontSize: 16 },
  qrContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  qrTitle: { fontSize: 48, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  qrSubtitle: { fontSize: 18, color: COLORS.textSecondary, marginBottom: 40 },
  qrCodeBox: { padding: 20, backgroundColor: 'white', borderRadius: 24, elevation: 10, shadowColor: '#000', shadowOpacity: 0.2 },
  waitingBox: { flexDirection: 'row', alignItems: 'center', marginTop: 40 },
  waitingText: { fontSize: 16, color: COLORS.textSecondary },
  successBox: { width: 250, height: 250, alignItems: 'center', justifyContent: 'center' },
  successText: { fontSize: 32, fontWeight: 'bold', color: COLORS.secondary, marginTop: 10 },
  doneButton: { backgroundColor: COLORS.primary, paddingHorizontal: 60, paddingVertical: 18, borderRadius: 16, marginTop: 40 },
  doneButtonText: { color: 'white', fontSize: 18, fontWeight: '700' },
  checkoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  checkoutHeaderTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
});
