import ipaddress
import re
import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, Field, model_validator

from app.models.whitelist_entry import WhitelistEntry, WhitelistType

DOMAIN_PATTERN = re.compile(r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$")
HASH_PATTERN = re.compile(r"^([a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$")


class WhitelistEntryCreate(BaseModel):
    type: WhitelistType
    value: str = Field(min_length=1, max_length=255)
    reason: str | None = Field(default=None, max_length=2000)
    expires_at: datetime | None = None
    kind: str = Field(default="allow", pattern="^(allow|block)$")

    @model_validator(mode="after")
    def validate_value(self) -> "WhitelistEntryCreate":
        if self.type == WhitelistType.IP:
            try:
                ipaddress.ip_network(self.value, strict=False)
            except ValueError as exc:
                raise ValueError("Must be a valid IP address or CIDR range") from exc
        elif self.type == WhitelistType.DOMAIN:
            if not DOMAIN_PATTERN.match(self.value):
                raise ValueError("Must be a valid domain name")
        elif self.type == WhitelistType.HASH:
            if not HASH_PATTERN.match(self.value):
                raise ValueError("Must be a valid MD5, SHA-1, or SHA-256 hash")
        # USER: any non-empty identifier (email or username) is accepted as-is.
        return self


class WhitelistEntryOut(BaseModel):
    id: uuid.UUID
    type: WhitelistType
    value: str
    reason: str | None
    expires_at: datetime | None
    kind: str  # "allow" | "block"
    is_active: bool
    created_by: uuid.UUID
    created_by_email: str
    created_at: datetime

    @classmethod
    def from_model(cls, entry: WhitelistEntry, created_by_email: str) -> "WhitelistEntryOut":
        return cls(
            id=entry.id,
            type=entry.type,
            value=entry.value,
            reason=entry.reason,
            expires_at=entry.expires_at,
            kind=entry.kind,
            is_active=entry.expires_at is None or entry.expires_at > datetime.now(UTC),
            created_by=entry.created_by,
            created_by_email=created_by_email,
            created_at=entry.created_at,
        )


class EffectiveWhitelistResponse(BaseModel):
    type: WhitelistType
    values: list[str]
