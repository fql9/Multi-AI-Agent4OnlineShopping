# 环境变量配置文件说明

## 📁 环境变量文件位置

### 1. Python Agent 环境变量

**位置**: `agents/.env`

**创建方法**:
```bash
# 从示例文件复制
cd agents
copy env.example .env
# 或
cp env.example .env
```

**配置内容**:
- `OPENAI_API_KEY` - LLM API Key（必需）
- `OPENAI_BASE_URL` - API 地址
- `DATABASE_URL` - 数据库连接字符串
- `TOOL_GATEWAY_URL` - Tool Gateway 地址

### 2. Docker Compose 环境变量

**位置**: 项目根目录 `.env`（可选）

**用途**: 用于 `docker-compose.full.yml` 中的环境变量

**创建方法**:
```bash
# 在项目根目录创建 .env 文件
```

**配置示例**:
```env
# LLM 配置
OPENAI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL_PLANNER=gpt-4o-mini
OPENAI_MODEL_VERIFIER=gpt-4o

# 数据库配置（Docker 内部使用，通常不需要修改）
DB_HOST=postgres
DB_PORT=5432
DB_USER=agent
DB_PASSWORD=agent_dev_password
DB_NAME=agent_db
```

## 🔧 快速设置

### 方法 1: 仅本地开发（不使用 Docker）

```bash
# 1. 创建 Python Agent 的 .env 文件
cd agents
copy env.example .env

# 2. 编辑 .env 文件，填入你的 API Key
# 使用文本编辑器打开 agents/.env
```

### 方法 2: Docker 部署

```bash
# 1. 在项目根目录创建 .env 文件（用于 Docker Compose）
# 2. 编辑 docker-compose.full.yml 中的环境变量，或使用 .env 文件
```

## 📝 必需的环境变量

### Python Agent（agents/.env）

```env
# 必需：LLM API Key
OPENAI_API_KEY=your-api-key-here

# 必需：数据库连接（Docker 部署时使用容器内地址）
DATABASE_URL=postgresql+asyncpg://agent:agent_dev_password@postgres:5432/agent_db

# 必需：Tool Gateway 地址（Docker 部署时使用容器名）
TOOL_GATEWAY_URL=http://tool-gateway:3000
```

### Docker Compose（项目根目录 .env）

```env
# 必需：LLM API Key
OPENAI_API_KEY=your-api-key-here

# 可选：其他配置
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL_PLANNER=gpt-4o-mini
OPENAI_MODEL_VERIFIER=gpt-4o
```

## 🔍 检查环境变量

### 检查 Python Agent 配置

```bash
# Windows PowerShell
cd agents
Get-Content .env

# 或检查环境变量是否被读取
python -c "from src.config import get_settings; print(get_settings().openai_api_key)"
```

### 检查 Docker 环境变量

```bash
# 查看容器的环境变量
docker exec agent-python env | findstr OPENAI
```

## ⚠️ 注意事项

1. **`.env` 文件不会被提交到 Git**（已在 `.gitignore` 中）
2. **不要将 API Key 提交到代码仓库**
3. **Docker 部署时**，环境变量可以在 `docker-compose.full.yml` 中直接配置，或使用 `.env` 文件
4. **数据库连接**：
   - 本地开发：`localhost:5433`（外部端口）
   - Docker 内部：`postgres:5432`（容器名和内部端口）

## 📚 相关文件

- 示例文件: `agents/env.example`
- Docker 配置: `docker-compose.full.yml`
- Python 配置: `agents/src/config.py`
