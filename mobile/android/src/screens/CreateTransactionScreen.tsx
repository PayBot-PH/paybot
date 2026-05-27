import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import { useMutation } from 'react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Toast from 'react-native-toast-message';
import { WebView } from 'react-native-webview';
import QRCode from 'react-native-qrcode-svg';
// import LinearGradient from 'react-native-linear-gradient'; // Removed due to missing module

const { width, height } = Dimensions.get('window');

const COLORS = {
  primary: '#5D2E91', // Maya Purple
  secondary: '#00BA97', // Maya Green
  dark: '#111827',
  light: '#F3F4F6',
  white: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
};

const api = {
  createTransaction: async (token, terminalId, data) => {
    const response = await fetch(
      `https://telegram.drl-developers.info/api/v1/pos-terminals/${terminalId}/transactions`,
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

const PaymentOptionCard = ({ title, subLabel, icon, logos, onPress }) => (
  <TouchableOpacity style={styles.optionCard} onPress={onPress} activeOpacity={0.8}>
    <View style={[styles.optionIconContainer, { backgroundColor: title.includes('Card') ? '#3B82F6' : '#5D2E91' }]}>
       <MaterialIcons name={icon} size={32} color="#fff" />
    </View>
    <View style={styles.optionTextContainer}>
      <Text style={styles.optionSubLabel}>{subLabel}</Text>
      <Text style={styles.optionTitle}>{title}</Text>
      <View style={styles.logosRow}>
        {logos.map((logo, idx) => (
          <View key={idx} style={styles.miniLogo}>
             {typeof logo === 'string' ? (
               <Text style={styles.miniLogoText}>{logo}</Text>
             ) : (
               <MaterialIcons name={logo.name} size={14} color={logo.color || '#666'} />
             )}
          </View>
        ))}
      </View>
    </View>
    <MaterialIcons name="chevron-right" size={24} color="#CBD5E1" />
  </TouchableOpacity>
);

const QuickAccessItem = ({ icon, label, onPress }) => (
  <TouchableOpacity style={styles.quickAccessItem} onPress={onPress}>
    <View style={styles.quickAccessIconBox}>
      <MaterialIcons name={icon} size={28} color="#5D2E91" />
    </View>
    <Text style={styles.quickAccessLabel}>{label}</Text>
  </TouchableOpacity>
);

export const CreateTransactionScreen = ({ route, navigation }) => {
  const { terminal } = route.params;
  const [token, setToken] = useState(null);
  const [amount, setAmount] = useState('0');
  const [showWebView, setShowWebView] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [qrContent, setQrContent] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [viewMode, setViewMode] = useState('keypad'); // 'keypad' or 'options'

  useEffect(() => {
    AsyncStorage.getItem('auth_token').then(setToken);
  }, []);

  const handleKeyPress = (key) => {
    if (key === '⌫') {
      setAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      return;
    }
    if (key === '.') {
      if (amount.includes('.')) return;
      setAmount((prev) => prev + '.');
      return;
    }
    setAmount((prev) => {
      if (prev === '0') return key;
      if (prev.includes('.') && prev.split('.')[1].length >= 2) return prev;
      return prev + key;
    });
  };

  const createMutation = useMutation(
    (method) => api.createTransaction(token, terminal.id, {
      amount: parseFloat(amount) * 100,
      payment_method: method,
      description: 'Terminal Sale'
    }),
    {
      onSuccess: (data) => {
        if (data.success) {
          setOrderId(data.order_id);
          if (data.qr_content) setQrContent(data.qr_content);
          else if (data.payment_url) {
            setCheckoutUrl(data.payment_url);
            setShowWebView(true);
          }
        }
      },
      onError: (err) => Toast.show({ type: 'error', text1: 'Error', text2: err.message }),
    }
  );

  useEffect(() => {
    let interval;
    if (orderId && (qrContent || checkoutUrl) && paymentStatus === 'pending') {
      interval = setInterval(async () => {
        try {
          const response = await fetch(`https://telegram.drl-developers.info/api/v1/pos-terminals/transactions/${orderId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (response.ok) {
            const result = await response.json();
            const status = result.data?.transaction?.status;
            if (status === 'completed') {
              setPaymentStatus('completed');
              clearInterval(interval);
              Toast.show({ type: 'success', text1: 'Payment Received!' });
            }
          }
        } catch (e) {}
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [orderId, qrContent, checkoutUrl, paymentStatus, token]);

  if (showWebView && checkoutUrl) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.checkoutHeader}>
          <TouchableOpacity onPress={() => setShowWebView(false)}>
            <MaterialIcons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.checkoutHeaderTitle}>Complete Payment</Text>
          <View style={{ width: 24 }} />
        </View>
        <WebView source={{ uri: checkoutUrl }} style={{ flex: 1 }} />
        {paymentStatus === 'completed' && (
           <View style={styles.fullScreenSuccess}>
             <MaterialIcons name="check-circle" size={100} color="#00BA97" />
             <Text style={styles.successText}>PAID SUCCESSFULLY</Text>
             <TouchableOpacity style={styles.doneButton} onPress={() => navigation.goBack()}>
               <Text style={styles.doneButtonText}>Finish</Text>
             </TouchableOpacity>
           </View>
        )}
      </SafeAreaView>
    );
  }

  if (qrContent) {
    return (
      <SafeAreaView style={styles.containerWhite}>
        <View style={styles.qrHeader}>
          <TouchableOpacity onPress={() => { setQrContent(null); setOrderId(null); setPaymentStatus('pending'); }}>
            <MaterialIcons name="arrow-back" size={28} color="#000" />
          </TouchableOpacity>
          <View style={styles.mayaLogoMini}><Text style={styles.mayaLogoText}>maya</Text></View>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.qrContent}>
           <Text style={styles.qrAmount}>₱{parseFloat(amount).toFixed(2)}</Text>
           <View style={styles.qrCard}>
             {paymentStatus === 'completed' ? (
                <View style={styles.successInner}>
                   <MaterialIcons name="check-circle" size={120} color="#00BA97" />
                   <Text style={styles.successTitle}>COMPLETED</Text>
                </View>
             ) : (
               <QRCode value={qrContent} size={width * 0.65} />
             )}
           </View>
           <TouchableOpacity style={styles.printButton} onPress={() => navigation.goBack()}>
              <Text style={styles.printButtonText}>{paymentStatus === 'completed' ? 'Done' : 'Cancel'}</Text>
           </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (viewMode === 'options') {
    return (
      <View style={styles.containerWhite}>
        <StatusBar barStyle="light-content" />
        <View style={styles.optionsHeader}>
          <View style={styles.optionsTopRow}>
            <View style={styles.mayaLogoContainer}>
               <Text style={styles.mayaText}>maya</Text>
               <View style={styles.businessBadge}><Text style={styles.businessText}>BUSINESS</Text></View>
            </View>
            <TouchableOpacity onPress={() => setViewMode('keypad')}>
              <MaterialIcons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.selectOptionText}>Select payment option</Text>
        </View>

        <View style={styles.optionsBody}>
          <PaymentOptionCard
            title="Debit or Credit Card"
            subLabel="Pay with"
            icon="credit-card"
            logos={['VISA', 'MC', 'JCB', 'AMEX']}
            onPress={() => createMutation.mutate('card')}
          />
          <PaymentOptionCard
            title="QR Code"
            subLabel="Pay with"
            icon="qr-code-scanner"
            logos={[{ name: 'qr-code-2', color: '#5D2E91' }]}
            onPress={() => createMutation.mutate('maya')}
          />

          <View style={styles.quickAccessSection}>
            <Text style={styles.quickAccessTitle}>Quick Access</Text>
            <View style={styles.quickAccessRow}>
              <QuickAccessItem icon="qr-code-2" label="Maya QR" onPress={() => createMutation.mutate('maya')} />
              <QuickAccessItem icon="center-focus-strong" label="QRPH" onPress={() => createMutation.mutate('maya')} />
              <QuickAccessItem icon="help-outline" label="Help Center" onPress={() => {}} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.containerDark}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      <View style={styles.displayArea}>
        <View style={styles.displayHeader}>
           <TouchableOpacity onPress={() => navigation.goBack()}><MaterialIcons name="menu" size={28} color="#fff" /></TouchableOpacity>
           <Text style={styles.displayTitle}>{terminal.terminal_name}</Text>
           <MaterialIcons name="wifi" size={20} color="#00BA97" />
        </View>
        <View style={styles.amountBox}>
           <Text style={styles.phpLabel}>PHP</Text>
           <Text style={styles.amountLarge}>{parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
        </View>
      </View>

      <View style={styles.keypadBox}>
        <View style={styles.keypadRows}>
          {[1,2,3,4,5,6,7,8,9,'.',0,'⌫'].map(k => (
            <TouchableOpacity key={k} style={styles.key} onPress={() => handleKeyPress(k)}>
               {k === '⌫' ? <MaterialIcons name="backspace" size={28} color="#111" /> : <Text style={styles.keyText}>{k}</Text>}
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.chargeBtn} onPress={() => setViewMode('options')}>
           <Text style={styles.chargeBtnText}>CHARGE</Text>
           <MaterialIcons name="chevron-right" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  containerDark: { flex: 1, backgroundColor: '#111827' },
  containerWhite: { flex: 1, backgroundColor: '#F8FAFC' },
  displayArea: { flex: 1, padding: 20, justifyContent: 'space-between' },
  displayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  displayTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  amountBox: { alignItems: 'center', marginBottom: 60 },
  phpLabel: { color: '#9CA3AF', fontSize: 18, fontWeight: 'bold' },
  amountLarge: { color: '#fff', fontSize: 64, fontWeight: '700' },
  keypadBox: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20 },
  keypadRows: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  key: { width: '30%', height: 70, backgroundColor: '#F3F4F6', borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  keyText: { fontSize: 28, fontWeight: '600', color: '#111' },
  chargeBtn: { width: '100%', backgroundColor: '#3B82F6', height: 70, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  chargeBtnText: { color: '#fff', fontSize: 22, fontWeight: 'bold', letterSpacing: 1 },
  optionsHeader: { padding: 25, paddingTop: 50, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, backgroundColor: '#5D2E91' },
  optionsTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mayaLogoContainer: { flexDirection: 'row', alignItems: 'center' },
  mayaText: { color: '#fff', fontSize: 28, fontWeight: 'bold', fontStyle: 'italic' },
  businessBadge: { backgroundColor: '#00BA97', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 5 },
  businessText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  selectOptionText: { color: '#fff', fontSize: 18, marginTop: 15, opacity: 0.9 },
  optionsBody: { padding: 20, flex: 1 },
  optionCard: { backgroundColor: '#fff', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 15, elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  optionIconContainer: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  optionTextContainer: { flex: 1, marginLeft: 15 },
  optionSubLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  optionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', marginTop: 2 },
  logosRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  miniLogo: { backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  miniLogoText: { fontSize: 10, fontWeight: 'bold', color: '#64748B' },
  quickAccessSection: { marginTop: 30 },
  quickAccessTitle: { fontSize: 14, fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 20 },
  quickAccessRow: { flexDirection: 'row', justifyContent: 'space-around' },
  quickAccessItem: { alignItems: 'center' },
  quickAccessIconBox: { width: 64, height: 64, backgroundColor: '#fff', borderRadius: 20, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowOpacity: 0.05 },
  quickAccessLabel: { marginTop: 10, fontSize: 12, fontWeight: '600', color: '#475569' },
  qrHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  mayaLogoMini: { backgroundColor: '#00BA97', padding: 6, borderRadius: 6 },
  mayaLogoText: { color: '#fff', fontWeight: 'bold', fontStyle: 'italic' },
  qrContent: { flex: 1, alignItems: 'center', paddingTop: 20 },
  qrAmount: { fontSize: 48, fontWeight: 'bold', color: '#000' },
  qrCard: { padding: 30, backgroundColor: '#fff', borderRadius: 30, marginTop: 40, elevation: 15 },
  printButton: { marginTop: 40, backgroundColor: '#111', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30 },
  printButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  fullScreenSuccess: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  successText: { fontSize: 28, fontWeight: 'bold', color: '#00BA97', marginVertical: 30 },
  doneButton: { backgroundColor: '#3B82F6', paddingHorizontal: 60, paddingVertical: 15, borderRadius: 30 },
  doneButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});
