from models.bot_settings import Bot_settings
from services.base_service import BaseCRUDService


class Bot_settingsService(BaseCRUDService[Bot_settings]):
    model = Bot_settings
