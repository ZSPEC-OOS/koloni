# Koloni Swarm v2.5

A browser-based swarm intelligence orchestration system built on a **Tool Infrastructure Layer (TIL)** — contract-based tool registration, async message bus, scoped context, and capability ACL.

> **Status:** No model is attached. All tool `execute()` functions are stubs that return placeholder data. Tools and model integration will be added later.

---

## Quick Start

ES modules require an HTTP server (not `file://`):

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

---

## Views

| File | Purpose |
|---|---|
| `index.html` | Landing page |
| `chat.html` | Conversational interface — send messages, trigger tools, upload custom tools |
| `infrastructure.html` | Architecture monitor — live bus metrics, context flow, ACL matrix, pipeline simulation |

---

## Repository Structure

```
koloni/
├── index.html               # Landing page
├── chat.html                # Chat interface
├── infrastructure.html      # Infrastructure visualizer
│
├── src/
│   └── core/                # Shared ES modules (no external dependencies)
│       ├── ToolContract.js      # Schema validation + execution wrapper
│       ├── AgentToolBus.js      # Async priority message queue
│       ├── ContextManager.js    # 4-scope shared state
│       ├── CapabilityACL.js     # JWT-based permission enforcement
│       └── ToolOrchestrator.js  # Central pipeline coordinator
│
├── styles/
│   ├── variables.css        # CSS custom properties
│   └── common.css           # Shared resets + component styles
│
└── tools/                   # Tool implementations (stub directory)
```

---

## Tool Schema — `koloni-tool-v1`

All tools must implement this interface:

```javascript
{
  id:      'my-tool',
  version: '1.0.0',
  schema:  'koloni-tool-v1',    // required
  input: {
    type: 'object',
    required: ['param'],
    properties: { param: { type: 'string' } }
  },
  output:  { type: 'object' },
  timeout: 5000,
  execute: async (input, context) => {
    // context.getValue(key)                       — read any scope
    // context.set(key, value, 'agent'|'private')  — write (tool-scoped only)
    return { result: '...' };
  }
}
```

---

## Architecture Components

| Component | Responsibility |
|---|---|
| **ToolContract** | Schema validation, input/output contracts, timeout race |
| **AgentToolBus** | Async priority queue, message dispatch, metrics |
| **ContextManager** | 4-scope state (private → agent → colony → global), fork/merge |
| **CapabilityACL** | JWT claims, rate limits, forbidden combination enforcement |
| **ToolOrchestrator** | Full pipeline: ACL → validate → context → execute → propagate |

### Context Scopes

- **private** — tool-only, cleared between calls
- **agent** — capabilities, claims, per-agent state
- **colony** — shared task results across agents
- **global** — swarm-wide policies, token budgets

### Agent Permissions

| Agent | Research | CodeExec | Network | FileSys |
|---|---|---|---|---|
| Queen | ✓ | ✗ | ✓ | ✓ |
| Worker | ✓ | ✓ | 10/min | tmp |
| Drone | ✓ | ✗ | ✗ | ✗ |
| SubColony | ✓ | ✓ | 100/min | isolated |

### Creating a New Tool

```javascript
const myTool = new ToolContract({
  id: 'my-tool',
  version: '1.0.0',
  schema: 'koloni-tool-v1',
  input: { type: 'object', required: ['query'] },
  output: { type: 'object' },
  timeout: 5000,
  execute: async (input, context) => {
    return { result: 'success' };
  }
});
