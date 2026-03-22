from models.customers import Customers
from services.base_service import BaseCRUDService


class CustomersService(BaseCRUDService[Customers]):
    model = Customers
