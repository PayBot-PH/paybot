from models.bot_logs import Bot_logs
from services.base_service import BaseCRUDService


class Bot_logsService(BaseCRUDService[Bot_logs]):
    model = Bot_logs
