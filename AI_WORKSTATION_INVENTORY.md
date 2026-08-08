# K.I.N.G.S. AI Workstation Inventory

## Purpose

This workstation provides the AI tooling used to develop K.I.N.G.S.
and support writing, research, investigation, publishing, and future
agent orchestration.

The Chromebook Linux container is storage-constrained, so the workstation
uses published packages, CLIs, and isolated runtimes whenever possible.
Full source repositories are NOT cloned unless source modification or
inspection is specifically required.

---

# Core AI Stack

## CrewAI
Version: 1.15.13
Installation: uv tool
Command: crewai
Purpose: Multi-agent orchestration and collaborative AI crews
Status: INSTALLED

## Letta Code
Version: 0.30.10
Installation: npm
Command: letta
Purpose: Persistent agent memory and long-running agents
Status: INSTALLED

## BeeAI Framework
Version: 0.1.82
Installation: isolated Python runtime
Runtime: ~/KINGS-AI/runtimes/beeai
Purpose: Agent framework, tool integration, RAG, MCP, and model integration
Status: INSTALLED

## Continue
Version: 1.5.47
Installation: npm
Command: cn
Purpose: AI-assisted software development and coding
Status: INSTALLED

## LobeHub CLI
Version: 0.0.47
Installation: npm
Command: lh
Purpose: AI agent/operator interface
Status: INSTALLED

## Hatchet TypeScript SDK
Version: 1.28.1
Installation: npm
Purpose: Workflow orchestration and background agent tasks
Status: INSTALLED

## Vercel AI SDK
Package: ai
Latest checked version: 7.0.58
Installation: PROJECT DEPENDENCY
Purpose: AI integration inside K.I.N.G.S. TypeScript/Next.js application
Status: NOT YET INSTALLED IN K.I.N.G.S.

---

# K.I.N.G.S. Project

Repository:
https://github.com/kevinmfwakley23-ux/kings-collectibles-1

Local project:
~/kings-collectibles-1

Current protected checkpoint:
bdb26ea - K.I.N.G.S. development checkpoint

Git status:
Clean and synchronized with origin/main

IMPORTANT:
The K.I.N.G.S. source tree is the actual application and must be preserved.

Disposable/generated dependencies such as node_modules may be removed
and regenerated from pnpm-lock.yaml when necessary.

---

# Runtime Strategy

The workstation does NOT maintain unnecessary copies of AI framework
source repositories.

Preferred pattern:

1. Published CLI/package
2. Isolated runtime
3. GitHub source only when source inspection/modification is required

This prevents the 12 GB Linux container from being consumed by
development repositories, documentation, tests, Git history, and
duplicate dependency trees.

---

# Planned AI Sections

## Development
Coding agents, software architecture, debugging, project automation.

## Writing
Book development, outlining, drafting, continuity, editing, memoir,
journaling, and publishing.

## Research
Research assistants, source organization, investigation, knowledge
retrieval, evidence organization, and fact checking.

## Specialized
Finance, trading, experimental agents, and other tools not directly
required by K.I.N.G.S.

---

# Storage Policy

Linux container size:
12 GB

AI tools should be installed only when their practical purpose has been
identified.

Do NOT clone large GitHub repositories merely to use an AI tool.

Before installing a large dependency:
1. Check available storage.
2. Determine whether a published package/CLI exists.
3. Prefer isolated environments.
4. Verify the tool.
5. Remove unnecessary source trees/caches.

---

# Core Stack Status

CrewAI       [x]
Letta        [x]
BeeAI        [x]
Continue     [x]
LobeHub      [x]
Hatchet      [x]
Vercel AI    [ ]

