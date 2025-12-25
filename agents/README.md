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

