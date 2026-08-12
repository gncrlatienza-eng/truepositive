import enum

from sqlalchemy import Enum as SAEnum


class Severity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    OK = "ok"


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Postgres ENUM storing each member's .value (lowercase) instead of its .name."""
    return SAEnum(enum_cls, name=name, values_callable=lambda cls: [e.value for e in cls])
