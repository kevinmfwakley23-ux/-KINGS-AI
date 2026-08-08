# K.I.N.G.S. BUILD SPECIFICATION

## Knowledge • Investigation • Narrative • Generation • System

**Status:** LOCKED ARCHITECTURAL SPECIFICATION  
**Purpose:** Master construction document for AI-assisted development of the K.I.N.G.S. system.

---

# 1. MISSION

K.I.N.G.S. is a modular AI intelligence platform designed to coordinate specialized AI agents for:

- research
- investigation
- knowledge management
- persistent memory
- narrative/book development
- review and validation
- project continuity
- document generation
- publishing workflows
- future domain-specific projects such as K.I.N.G.S. Collectibles

K.I.N.G.S. is NOT a clone of any existing repository.

Existing open-source projects are architectural references from which proven ideas may be studied and selectively adapted.

K.I.N.G.S. owns its own architecture, project state, canonical knowledge, workflows, and decision authority.

---

# 2. PRIMARY ARCHITECTURAL PRINCIPLE

K.I.N.G.S. follows:

SOURCE → KNOWLEDGE → MEMORY → REASONING → ACTION → VALIDATION → OUTPUT

Agents must not rely solely on conversational context when authoritative project information exists.

When source material exists, K.I.N.G.S. should retrieve and inspect the source before generating conclusions.

---

# 3. CORE ARCHITECTURE

```text
                         USER
                           │
                           ▼
                  ┌────────────────┐
                  │ KINGS CLI/API  │
                  └───────┬────────┘
                          │
                          ▼
                  ┌────────────────┐
                  │  ORCHESTRATOR  │
                  └───────┬────────┘
                          │
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
     RESEARCH          BOOK             REVIEW
       AGENTS          AGENTS            AGENTS
          │               │                │
          └───────────────┼────────────────┘
                          ▼
                 ┌─────────────────┐
                 │ KNOWLEDGE LAYER │
                 │                 │
                 │ Canon           │
                 │ Bible           │
                 │ Sources         │
                 │ Documents       │
                 │ Evidence        │
                 │ Research        │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ MEMORY LAYER    │
                 │                 │
                 │ Working         │
                 │ Episodic        │
                 │ Semantic        │
                 │ Procedural      │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ RETRIEVAL       │
                 │                 │
                 │ Keyword/BM25    │
                 │ Semantic        │
                 │ Graph           │
                 │ Hybrid/RRF      │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ TOOLS / MCP     │
                 │                 │
                 │ Files           │
                 │ Web             │
                 │ Git             │
                 │ Search          │
                 │ APIs            │
                 │ Documents       │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ MODEL PROVIDERS │
                 │                 │
                 │ OpenAI          │
                 │ Anthropic       │
                 │ Gemini          │
                 │ Local Models    │
                 │ Future Models   │
                 └─────────────────┘
