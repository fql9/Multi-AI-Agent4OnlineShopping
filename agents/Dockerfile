# Python Agent Dockerfile
FROM python:3.11-slim AS base

WORKDIR /app

# Install system dependencies for building
RUN apt-get update || true && \
    apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    curl \
    || apt-get install -y build-essential gcc curl && \
    rm -rf /var/lib/apt/lists/*

# Copy agent files
COPY agents/pyproject.toml agents/README.md ./
COPY agents/src ./src

# Install Python dependencies (including build dependencies)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -e .

# Production stage
FROM python:3.11-slim AS production

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Copy installed packages from base stage
COPY --from=base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=base /usr/local/bin /usr/local/bin

# Copy application code
COPY agents/src ./src
COPY agents/pyproject.toml ./

# Create session storage directory
RUN mkdir -p /app/data/sessions

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=8000

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the HTTP server
CMD ["python", "-m", "src.server"]
