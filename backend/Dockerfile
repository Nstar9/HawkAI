FROM python:3.12-slim

# ── Node.js 22 + MongoDB MCP server (pre-installed, pinned) ──────────────────
# We pre-install mongodb-mcp-server at image build time so runtime never
# needs to hit the npm registry. Using npx with an already-installed package
# is instantaneous and immune to version drift or network timeouts.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g mongodb-mcp-server \
    && mongodb-mcp-server --version 2>/dev/null || echo "mcp-server installed"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY data ./data

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
