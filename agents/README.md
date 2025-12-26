# Shopping Agents

Multi-AI-Agent for Online Shopping - Agent Orchestration Layer

## Overview

This package contains the LangGraph-based agent orchestration system for the shopping platform.

## Features

- **Intent Agent**: Parse user intent into structured MissionSpec
- **Candidate Agent**: Retrieve and filter product candidates
- **Verifier Agent**: Real-time verification (pricing, shipping, compliance)
- **Execution Agent**: Generate executable plans and draft orders

## Installation

```bash
# Using conda
conda activate shopping-agent
pip install -e ".[dev]"

# Using uv
uv sync --all-extras
```

## LLM 配置

支持多种 LLM 后端：

### OpenAI API

```bash
export OPENAI_API_KEY=sk-xxx
export OPENAI_MODEL_PLANNER=gpt-4o-mini
export OPENAI_MODEL_VERIFIER=gpt-4o
```

### Poe API（推荐）

```bash
export OPENAI_API_KEY=your-poe-api-key
export OPENAI_BASE_URL=https://api.poe.com/bot/
export OPENAI_MODEL_PLANNER=Claude-3.5-Sonnet
export OPENAI_MODEL_VERIFIER=Claude-Opus-4.1
```

### Mock 模式

如果未设置 `OPENAI_API_KEY`，Agent 会自动使用 mock 响应进行测试。

## Usage

```python
from src.graph import get_agent_graph

graph = get_agent_graph()
result = await graph.ainvoke({"messages": [("user", "Help me buy a LEGO set")]})
```

## Development

```bash
# Lint
ruff check src/

# Format
ruff format src/

# Type check
mypy src/

# Test
pytest tests/ -v
```

## License

GPL-3.0

