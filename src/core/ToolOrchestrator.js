/**
 * ToolOrchestrator - Central execution coordinator.
 *
 * Pipeline for each tool call:
 *   1. ACL capability check
 *   2. Input schema validation
 *   3. Scoped context creation + requiredContext check
 *   4. Execution (via bus if provided, otherwise direct)
 *   5. Output → context propagation (producesContext)
 *
 * @param {AgentToolBus|null}  bus      - if null, tools execute directly
 * @param {ContextManager}     context
 * @param {CapabilityACL}      acl
 * @param {Function|null}      logger   - (execId, type, message) => void
 */
export class ToolOrchestrator {
    constructor(bus, context, acl, logger = null) {
        this.bus       = bus;
        this.context   = context;
        this.acl       = acl;
        this.contracts = new Map();
        this.logger    = logger || (() => {});
    }

    registerContract(contract) {
        this.contracts.set(contract.spec.id, contract);
    }

    async execute(agentId, toolId, input, options = {}) {
        const execId = `exec-${Date.now()}`;

        // 1. ACL check
        this._log(execId, 'validate', 'Checking agent capabilities...');
        const agentClaims = this.context.getValue('agent_claims')
            || this.acl.generateClaims('worker');

        const aclResult = this.acl.checkCapability(agentClaims, toolId, []);
        if (!aclResult.allowed) {
            this._log(execId, 'error', `ACL Denied: ${aclResult.reason}`);
            throw new Error(aclResult.reason);
        }

        // 2. Schema validation
        this._log(execId, 'validate', 'Validating input schema...');
        const contract = this.contracts.get(toolId);
        if (!contract) throw new Error(`Unknown tool: ${toolId}`);

        const validation = contract.validateInput(input);
        if (!validation.valid) {
            this._log(execId, 'error', `Validation Failed: ${validation.errors.join(', ')}`);
            throw new Error('VALIDATION_FAIL');
        }

        // 3. Scoped context + dependency check
        this._log(execId, 'execute', 'Preparing execution context...');
        const execContext = this.context.createScopedContext(agentId, { id: toolId });

        if (contract.spec.requiredContext) {
            execContext.require(contract.spec.requiredContext);
        }

        // 4. Execute
        this._log(execId, 'execute', 'Dispatching tool...');
        agentClaims.activeTools = agentClaims.activeTools || [];
        agentClaims.activeTools.push(toolId);
        this.context.set('agent_claims', agentClaims, 'agent');

        let result;
        if (this.bus) {
            // Bus mode: passes contractFn so bus can call the real execute
            result = await this.bus.submit(agentId, toolId, input, execContext, {
                ...options,
                contractFn: contract.spec.execute,
            });
        } else {
            // Direct mode: call contract.execute synchronously
            result = await contract.execute(input, execContext);
        }

        // 5. Propagate outputs to context
        this._log(execId, 'complete', 'Propagating context outputs...');
        if (contract.spec.producesContext) {
            contract.spec.producesContext.forEach(key => {
                if (result[key] !== undefined) {
                    this.context.set(key, result[key], 'colony');
                }
            });
        }

        this._log(execId, 'complete', `Tool ${toolId} completed successfully`);

        agentClaims.activeTools = agentClaims.activeTools.filter(t => t !== toolId);
        this.context.set('agent_claims', agentClaims, 'agent');

        return result;
    }

    _log(execId, type, message) {
        this.logger(execId, type, message);
    }
}
