from models.api_configs import Api_configs
from services.base_service import BaseCRUDService


class Api_configsService(BaseCRUDService[Api_configs]):
    model = Api_configs
