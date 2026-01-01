#!/bin/bash
# 服务器部署脚本

set -e

echo "🚀 Starting deployment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please configure environment variables first."
    echo "   Copy env.prod.example to .env and fill in the values."
    exit 1
fi

# Build images
echo "📦 Building Docker images..."
docker compose -f docker-compose.prod.yml build

# Start services
echo "🚀 Starting services..."
docker compose -f docker-compose.prod.yml up -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo "📊 Service status:"
docker compose -f docker-compose.prod.yml ps

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "✅ Deployment completed!"
echo "🌐 Access URLs:"
echo "   Web App: http://${SERVER_IP}:3001"
echo "   Tool Gateway: http://${SERVER_IP}:3000/health"
echo ""
echo "📋 Useful commands:"
echo "   View logs: docker compose -f docker-compose.prod.yml logs -f"
echo "   Stop services: docker compose -f docker-compose.prod.yml down"
echo "   Restart services: docker compose -f docker-compose.prod.yml restart"
