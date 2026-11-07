"""Initial commerce schema."""

from alembic import op
from shopeo.db import Base
from shopeo import models

revision = "001"
down_revision = None


def upgrade():
    Base.metadata.create_all(op.get_bind())


def downgrade():
    raise RuntimeError(
        "Destructive downgrade disabled; restore a verified backup instead."
    )
