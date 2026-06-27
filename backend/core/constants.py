"""Shared constants to prevent circular imports between routers."""

# xend PH bank accounts
PAYBOT_BANK_ACCOUNTS = {
    "Security Bank Corporation": {"number": "0000068888173", "name": "xend PH"},
    "Asia United Bank": {"number": "934105321485", "name": "xend PH"},
}

# Directory for uploaded bank transfer receipts
BANK_RECEIPTS_SUBDIR = "bank-receipts"

# App settings keys
MAINTENANCE_MODE_KEY = "maintenance_mode"
USDT_PHP_RATE_KEY = "usdt_php_rate"
DEFAULT_USDT_PHP_RATE = 58.0
USDT_TRC20_ADDRESS_KEY = "usdt_trc20_address"
