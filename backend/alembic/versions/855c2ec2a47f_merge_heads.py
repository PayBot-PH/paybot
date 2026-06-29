"""merge heads

Revision ID: 855c2ec2a47f
Revises: 8aa3587f0f7e, q1r2s3t4u5v6
Create Date: 2026-05-26 20:31:02.325828

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '855c2ec2a47f'
down_revision: Union[str, Sequence[str], None] = ('8aa3587f0f7e', 'q1r2s3t4u5v6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass