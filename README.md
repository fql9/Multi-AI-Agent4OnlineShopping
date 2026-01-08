# Multi-AI-Agent4OnlineShopping

> **shopping like prompting!**

Build an auditable, tool-driven multi-agent system that turns a user's *purchase mission* into an executable **Draft Order** (without capturing payment), backed by **strong facts** (pricing/stock/shipping/tax/compliance/policies) obtained only via tools and **evidence snapshots** that can be replayed for cross-border disputes.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](docker-compose.full.yml)
## Quick Start (Docker)

```bash
git clone https://github.com/fql9/Multi-AI-Agent4OnlineShopping.git
cd Multi-AI-Agent4OnlineShopping

cp .env.example .env
# Edit .env and set OPENAI_API_KEY

docker compose -f docker-compose.full.yml up -d
docker compose -f docker-compose.full.yml ps
```

Open Web UI: `http://localhost:3001`

---

## Docs

- **Deployment**: [`doc/18_deployment.md`](doc/18_deployment.md)
- **Ops runbook (commands)**: [`doc/19_ops_runbook.md`](doc/19_ops_runbook.md)
- **Design docs index (Chinese)**: [`doc/README.md`](doc/README.md)
- **Tool catalog**: [`doc/05_tool_catalog.md`](doc/05_tool_catalog.md)
- **Architecture explanation**: [`ARCHITECTURE_EXPLANATION.md`](ARCHITECTURE_EXPLANATION.md)
- **Windows / PowerShell examples**: [`QUICK_START.md`](QUICK_START.md)

---

## MCP: GitHub CI & Docker Jobs (Python)

本项目包含一个 Python MCP Server，提供 GitHub Actions CI 管理和本地 Docker Job 执行能力。

### 功能特性

**CI 工具（6 个）**:
- `ci_trigger` - 触发 workflow_dispatch（自动注入 correlation_id）
- `ci_find_latest_run` - 查找最新 run（支持 correlation_id 过滤）
- `ci_get_run` - 获取 run 详情
- `ci_get_run_jobs` - 获取 jobs/steps 结构化信息
- `ci_get_failure_summary` - 获取失败日志 tail
- `ci_comment_pr` - 在 PR 上评论

**Docker Job 工具（7 个）**:
- `job_start` - 启动 Docker 容器（带安全约束）
- `job_status` - 查询 job 状态
- `job_logs` - 获取容器日志
- `job_cancel` - 取消运行中的 job
- `job_artifacts` - 列出产物
- `job_list` - 列出所有 jobs
- `job_cleanup` - 清理旧 jobs

详细文档：[`tools/mcp-gh-ci-jobs/README.md`](tools/mcp-gh-ci-jobs/README.md)

---

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
