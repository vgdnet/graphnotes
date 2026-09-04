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
    email: EmailStr
    accept_author_contract: bool = False

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
    def normalize_email(cls, value: EmailStr) -> str:
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
    email: str
    display_name: str
    phone: str | None = None
    telegram: str | None = None
    phone_public: bool = False
    telegram_public: bool = False
    website: str | None = None
    role: str
    is_active: bool
    is_author: bool
    author_contract_version: str | None
    author_contract_accepted_at: datetime | None
    author_contract_withdrawn_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    telegram: str | None = Field(default=None, max_length=64)
    phone_public: bool | None = None
    telegram_public: bool | None = None
    website: str | None = Field(default=None, max_length=300)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name_update(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("display name must not be blank")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email_update(cls, value: EmailStr | None) -> str | None:
        if value is None:
            return None
        return str(value).casefold()

    @field_validator("phone", "telegram", "website")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class AuthorContractResponse(BaseModel):
    version: str
    title: str
    responsibility: str
    deposit: str
    withdraw: str


class AuthorAcceptRequest(BaseModel):
    accepted: bool
