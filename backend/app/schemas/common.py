from pydantic import BaseModel


def reject_explicit_nulls(model: BaseModel, *fields: str) -> None:
    """PATCH schemas use `X | None = None` so a field can be omitted, but for
    columns that are NOT NULL in the database an explicit `null` must be a
    422 -- otherwise it reaches the row via setattr and fails as a 500
    (IntegrityError, or AttributeError on `None.value`).
    """
    sent_null = [f for f in fields if f in model.model_fields_set and getattr(model, f) is None]
    if sent_null:
        raise ValueError(f"{', '.join(sent_null)} cannot be null")
