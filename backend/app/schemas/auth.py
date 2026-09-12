import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$")


def normalize_username(value: str) -> str:
    username = value.strip().casefold()
    if not 3 <= len(username) <= 32 or not USERNAME_PATTERN.fullmatch(username):
        raise ValueError(
            "username must be 3-32 characters and contain only letters, "
            "numbers, dots, underscores, or hyphens"
        )
    return username


class RegisterRequest(BaseModel):
    username: str
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)
    email: EmailStr | None = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return normalize_username(value)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("display name must not be blank")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr | None) -> str | None:
        if value is None:
            return None
        return str(value).casefold()


class LoginRequest(BaseModel):
    username: str
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return normalize_username(value)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: str | None
    display_name: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
