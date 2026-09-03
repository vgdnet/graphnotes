from datetime import UTC, datetime

from app.models.user import User

AUTHOR_CONTRACT_VERSION = "2026-09-03"
AUTHOR_CONTRACT_REQUIRED = "author contract must be accepted to contribute"

AUTHOR_CONTRACT = {
    "version": AUTHOR_CONTRACT_VERSION,
    "title": "Договор автора GraphNotes",
    "responsibility": (
        "Принимая договор, вы несёте ответственность за содержание своих "
        "заметок и связанных с ними связей, которые предлагаете в общую ризому."
    ),
    "deposit": (
        "Принятие фиксирует авторство вклада в GraphNotes: записываются ваш "
        "внутренний UUID, время и версия договора. Это подтверждение авторства "
        "в продукте, не второй канон Markdown и не платёж."
    ),
    "withdraw": (
        "Вы можете отозвать статус автора. GraphNotes запишет время отзыва; "
        "новые предложения, загрузки как вклад и подключение git как вклад "
        "будут недоступны, пока вы не примете договор снова. Заметки, уже "
        "принятые в общую ризому, остаются в её git (Markdown — источник "
        "истины); этот срез не удаляет опубликованный текст автоматически."
    ),
}


def apply_accept(user: User, *, now: datetime | None = None) -> None:
    stamp = now or datetime.now(UTC)
    user.is_author = True
    user.author_contract_version = AUTHOR_CONTRACT_VERSION
    user.author_contract_accepted_at = stamp


def apply_withdraw(user: User, *, now: datetime | None = None) -> None:
    stamp = now or datetime.now(UTC)
    user.is_author = False
    user.author_contract_withdrawn_at = stamp
