from models.subscriptions import Subscriptions
from services.base_service import BaseCRUDService


class SubscriptionsService(BaseCRUDService[Subscriptions]):
    model = Subscriptions
