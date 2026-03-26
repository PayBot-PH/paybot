export type Language = 'en' | 'zh';

export const translations = {
  en: {
    /* Nav sections */
    nav_overview: 'Overview',
    nav_payments: 'Payments',
    nav_bot: 'Bot',
    nav_administration: 'Administration',
    nav_help: 'Help & Legal',

    /* Nav items */
    nav_dashboard: 'Dashboard',
    nav_wallet: 'Wallet',
    nav_payments_hub: 'Payments Hub',
    nav_scan_qrph: 'Scan QRPH',
    nav_transactions: 'Transactions',
    nav_disbursements: 'Disbursements',
    nav_reports: 'Reports',
    nav_bot_messages: 'Bot Messages',
    nav_bot_settings: 'Bot Settings',
    nav_admin_management: 'Admin Management',
    nav_requests: 'Requests',
    nav_usdt_requests: 'USDT Requests',
    nav_topup_requests: 'Top-up Requests',
    nav_bank_deposits: 'Bank Deposits',
    nav_compliance: 'Compliance',
    nav_kyb_registrations: 'KYB Registrations',
    nav_kyc_verifications: 'KYC Verifications',
    nav_roles: 'Role Management',
    nav_policies: 'Policies',
    nav_contact_support: 'Contact Support',
    nav_xendit: 'Xendit Gateway',

    /* User / auth */
    sign_out: 'Sign Out',
    super_admin: 'Super Admin',
    admin: 'Admin',
    super_administrator: 'Super Administrator',
    administrator: 'Administrator',

    /* Header */
    live: 'Live',
    offline: 'Offline',
    switch_light: 'Switch to light mode',
    switch_dark: 'Switch to dark mode',
    switch_chinese: 'Switch to Chinese',
    switch_english: 'Switch to English',
  },
  zh: {
    /* Nav sections */
    nav_overview: '概览',
    nav_payments: '支付',
    nav_bot: '机器人',
    nav_administration: '管理',
    nav_help: '帮助与法律',

    /* Nav items */
    nav_dashboard: '仪表板',
    nav_wallet: '钱包',
    nav_payments_hub: '支付中心',
    nav_scan_qrph: '扫描 QRPH',
    nav_transactions: '交易记录',
    nav_disbursements: '付款',
    nav_reports: '报告',
    nav_bot_messages: '机器人消息',
    nav_bot_settings: '机器人设置',
    nav_admin_management: '管理员管理',
    nav_requests: '请求',
    nav_usdt_requests: 'USDT 请求',
    nav_topup_requests: '充值请求',
    nav_bank_deposits: '银行存款',
    nav_compliance: '合规',
    nav_kyb_registrations: 'KYB 注册',
    nav_kyc_verifications: 'KYC 验证',
    nav_roles: '角色管理',
    nav_policies: '政策',
    nav_contact_support: '联系支持',
    nav_xendit: 'Xendit 支付',

    /* User / auth */
    sign_out: '退出登录',
    super_admin: '超级管理员',
    admin: '管理员',
    super_administrator: '超级管理员',
    administrator: '管理员',

    /* Header */
    live: '在线',
    offline: '离线',
    switch_light: '切换到亮色模式',
    switch_dark: '切换到暗色模式',
    switch_chinese: '切换到中文',
    switch_english: '切换到英文',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
