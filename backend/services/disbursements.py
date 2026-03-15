from models.disbursements import Disbursements
from services.base_service import BaseCRUDService


class DisbursementsService(BaseCRUDService[Disbursements]):
    model = Disbursements
