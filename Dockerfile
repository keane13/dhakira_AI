# One container: the FastAPI backend serves the API and the built frontend on port 8000.
# Suits Azure Container Apps or any container host.

# 1) Frontend, built in server mode so it talks to the API on the same origin.
FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc --noEmit && npx vite build --mode server

# 2) API and static files.
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DHAKIRA_ENV=production \
    DHAKIRA_STATIC_DIR=/app/static \
    DHAKIRA_DATABASE_URL=sqlite:////data/dhakira.db
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY --from=web /web/dist static
RUN useradd --create-home --uid 10001 app && mkdir -p /data && chown -R app /app /data
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["python", "-m", "uvicorn", "app.main:create_app", "--factory", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
