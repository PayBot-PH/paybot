import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme';

export const SettingsScreen = () => {
  const { logout, user } = useAuth();
  const { colors, common, roundness } = useTheme();

  const SettingItem = ({ icon, label, onPress, color, showArrow = true }) => (
    <TouchableOpacity
      style={[styles.item, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.iconBox, { backgroundColor: (color || colors.text) + '10' }]}>
        <MaterialIcons name={icon} size={22} color={color || colors.text} />
      </View>
      <Text style={[styles.itemText, { color: color || colors.text }]}>{label}</Text>
      {showArrow && <MaterialIcons name="chevron-right" size={24} color={colors.textSecondary} />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderRadius: roundness.lg }]}>
           <View style={[styles.avatar, { backgroundColor: common.primary }]}>
              <Text style={styles.avatarText}>{user?.username?.substring(0, 1).toUpperCase() || 'P'}</Text>
           </View>
           <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]}>{user?.username || 'PayBot User'}</Text>
              <Text style={[styles.profileRole, { color: colors.textSecondary }]}>Administrator</Text>
           </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Account</Text>
          <SettingItem icon="person-outline" label="Personal Information" />
          <SettingItem icon="security" label="Login & Security" />
          <SettingItem icon="notifications-none" label="Notifications" />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Terminal Settings</Text>
          <SettingItem icon="devices" label="Manage Terminals" />
          <SettingItem icon="receipt-long" label="Receipt Templates" />
          <SettingItem icon="language" label="Payout Settings" />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>More</Text>
          <SettingItem icon="help-outline" label="Support Center" />
          <SettingItem icon="info-outline" label="About PayBot" />
          <SettingItem
            icon="logout"
            label="Log Out"
            onPress={logout}
            color={common.danger}
            showArrow={false}
          />
        </View>

        <Text style={[styles.versionText, { color: colors.textSecondary }]}>PayBot v2.4.0 (Live)</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 24,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  content: {
    padding: 24,
  },
  profileCard: {
     flexDirection: 'row',
     padding: 20,
     alignItems: 'center',
     marginBottom: 32,
  },
  avatar: {
     width: 60,
     height: 60,
     borderRadius: 30,
     alignItems: 'center',
     justifyContent: 'center',
  },
  avatarText: {
     color: '#fff',
     fontSize: 24,
     fontWeight: '800',
  },
  profileInfo: {
     marginLeft: 16,
  },
  profileName: {
     fontSize: 18,
     fontWeight: '800',
  },
  profileRole: {
     fontSize: 13,
     fontWeight: '600',
     marginTop: 2,
  },
  section: {
     marginBottom: 32,
  },
  sectionTitle: {
     fontSize: 12,
     fontWeight: '800',
     textTransform: 'uppercase',
     letterSpacing: 1,
     marginBottom: 12,
     paddingLeft: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconBox: {
     width: 40,
     height: 40,
     borderRadius: 12,
     alignItems: 'center',
     justifyContent: 'center',
  },
  itemText: {
    flex: 1,
    fontSize: 16,
    marginLeft: 14,
    fontWeight: '600',
  },
  versionText: {
     textAlign: 'center',
     fontSize: 12,
     fontWeight: '600',
     marginTop: 20,
     marginBottom: 40,
  }
});
