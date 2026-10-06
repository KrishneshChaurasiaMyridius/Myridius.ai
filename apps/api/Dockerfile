FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY alembic.ini .
COPY migrations ./migrations

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/ready')"
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]