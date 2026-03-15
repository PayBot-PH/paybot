from models.wallets import Wallets
from services.base_service import BaseCRUDService


class WalletsService(BaseCRUDService[Wallets]):
    model = Wallets
