from models.wallet_transactions import Wallet_transactions
from services.base_service import BaseCRUDService


class Wallet_transactionsService(BaseCRUDService[Wallet_transactions]):
    model = Wallet_transactions
