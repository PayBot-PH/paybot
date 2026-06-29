"""final merge heads

Revision ID: f3b4c5d6e7f8
Revises: ('855c2ec2a47f', 'add_uq_api_configs_service_key')
Create Date: 2026-06-05 13:55:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f3b4c5d6e7f8'
down_revision: Union[str, Sequence[str], None] = ('855c2ec2a47f', 'add_uq_api_configs_service_key')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
