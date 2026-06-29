import { useColorScheme } from 'react-native';

export const COLORS = {
  primary: '#2B66FF',
  secondary: '#10B981',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',

  light: {
    background: '#FFFFFF',
    surface: '#F8FAFC',
    text: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    card: '#FFFFFF',
    tabBar: '#FFFFFF',
  },
  dark: {
    background: '#0F172A',
    surface: '#1E293B',
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    border: '#334155',
    card: '#1E293B',
    tabBar: '#1E293B',
  }
};

export const useTheme = () => {
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? COLORS.dark : COLORS.light;

  return {
    isDark,
    colors,
    common: {
      primary: COLORS.primary,
      secondary: COLORS.secondary,
      success: COLORS.success,
      warning: COLORS.warning,
      danger: COLORS.danger,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
    },
    roundness: {
      sm: 8,
      md: 12,
      lg: 20,
      full: 9999,
    },
    shadows: {
      sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
      md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 4,
      },
    }
  };
};
