FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    GRAPHNOTES_WIKIDIFF2_HELPER=/usr/local/bin/graphnotes-wikidiff2

WORKDIR /app

COPY scripts/build_wikidiff2.sh /tmp/build_wikidiff2.sh
COPY wikidiff2/main.cpp /tmp/graphnotes-wikidiff2-main.cpp

# Native wikidiff2 C++ helper (ADR-018 / TZ 3.03). php-cli / php-wikidiff2
# were only for this path; they are not installed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        g++ \
        ca-certificates \
        curl \
        libthai-dev \
        libthai0 \
    && chmod +x /tmp/build_wikidiff2.sh \
    && WIKIDIFF2_MAIN=/tmp/graphnotes-wikidiff2-main.cpp \
       WIKIDIFF2_DEST=/usr/local/bin/graphnotes-wikidiff2 \
       /tmp/build_wikidiff2.sh \
    && apt-get purge -y --auto-remove g++ libthai-dev curl \
    && apt-get install -y --no-install-recommends libthai0 \
    && rm -rf /var/lib/apt/lists/* /tmp/build_wikidiff2.sh /tmp/graphnotes-wikidiff2-main.cpp /tmp/wikidiff2-src \
    && /usr/local/bin/graphnotes-wikidiff2 --version

COPY pyproject.toml ./
COPY app ./app
RUN python -m pip install --upgrade pip && python -m pip install .

COPY alembic.ini ./
COPY migrations ./migrations

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
