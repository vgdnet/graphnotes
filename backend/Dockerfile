FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Leftover until the native wikidiff2 C++ helper ships (ADR-018 / TZ 3.03).
# Canon runtime is compiled src/lib + CLI, not PHP. These packages leave then.
RUN apt-get update \
    && apt-get install -y --no-install-recommends php-cli php-wikidiff2 \
    && rm -rf /var/lib/apt/lists/* \
    && php -r 'if (!function_exists("wikidiff2_do_diff")) { fwrite(STDERR, "wikidiff2 missing\n"); exit(1); }'

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
RUN python -m pip install --upgrade pip && python -m pip install .

COPY alembic.ini ./
COPY migrations ./migrations

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
