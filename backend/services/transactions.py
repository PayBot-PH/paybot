from typing import Optional

from models.transactions import Transactions
from services.base_service import BaseCRUDService


class TransactionsService(BaseCRUDService[Transactions]):
    model = Transactions

    def _apply_sort(self, query, sort: Optional[str]):
        """Transactions use a secondary sort on ``id`` for stable ordering."""
        if sort:
            if sort.startswith("-"):
                field_name = sort[1:]
                if hasattr(self.model, field_name):
                    query = query.order_by(
                        getattr(self.model, field_name).desc(),
                        self.model.id.desc(),
                    )
            else:
                if hasattr(self.model, sort):
                    query = query.order_by(
                        getattr(self.model, sort),
                        self.model.id.asc(),
                    )
        else:
            query = query.order_by(self.model.id.desc())
        return query
