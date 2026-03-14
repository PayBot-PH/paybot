from models.refunds import Refunds
from services.base_service import BaseCRUDService


class RefundsService(BaseCRUDService[Refunds]):
    model = Refunds
