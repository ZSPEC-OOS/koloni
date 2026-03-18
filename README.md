# Koloni Swarm Intelligence System v2.5

## Tool Infrastructure Layer (TIL)

This release establishes the foundational infrastructure for secure, scalable tool integration within the Koloni agent swarm. Individual tools can now be developed against a standardized contract system.

### Architecture Components

| Component | Responsibility |
|-----------|--------------|
| **ToolContract** | Schema validation, interface standardization |
| **AgentToolBus** | Async message queue, non-blocking execution |
| **ContextManager** | 4-scope shared state (Private→Agent→Colony→Global) |
| **CapabilityACL** | JWT-based permissions, forbidden combinations |
| **ToolOrchestrator** | Execution coordinator, lifecycle management |

### Quick Start

1. Open `index.html` in browser
2. Navigate tabs (Contract, Bus, Context, ACL) to view infrastructure
3. Click **"Simulate Tool Call"** to see validation → execution flow
4. Click **"Run Pipeline"** to see multi-tool context passing

### Creating a New Tool

Tools implement the `koloni-tool-v1` schema:

```javascript
const myTool = new ToolContract({
  id: 'my-tool',
  version: '1.0.0',
  schema: 'koloni-tool-v1',
  input: { type: 'object', required: ['query'] },
  output: { type: 'object', properties: { result: { type: 'string' } } },
  timeout: 5000,
  execute: async (input, context) =&gt; {
    // Business logic here
    // Infrastructure handles: sandbox, ACL, validation, timeouts
    return { result: 'success' };
  }
});
