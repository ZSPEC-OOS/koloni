/**
 * AgentToolBus - Async message queue for non-blocking tool execution.
 *
 * Agents submit TOOL_REQUEST messages; the bus queues, prioritizes, and
 * dispatches them. When a contractFn is attached to a message it is called
 * as the executor; otherwise a stub response is returned (useful for
 * visualization / integration tests).
 *
 * Pass onMetricsUpdate(queueDepth, activeJobs) to receive live bus stats.
 */
export class AgentToolBus {
    constructor(onMetricsUpdate = null) {
        this.queue          = [];
        this.activeJobs     = new Map();
        this.subscribers    = new Map();
        this.stats          = { messages: 0, errors: 0 };
        this.onMetricsUpdate = onMetricsUpdate;
        this._processInterval = setInterval(() => this._processQueue(), 100);
    }

    /**
     * Submit a tool request to the bus.
     * @param {string}   agentId
     * @param {string}   toolId
     * @param {object}   input
     * @param {object}   context  - scoped context proxy
     * @param {object}   options  - timeout, priority, contractFn
     * @returns {Promise<any>}
     */
    async submit(agentId, toolId, input, context, options = {}) {
        const message = {
            id:        `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type:      'TOOL_REQUEST',
            agentId,
            toolId,
            input,
            context,
            options: {
                timeout:     options.timeout     || 5000,
                maxRetries:  options.maxRetries  || 3,
                priority:    options.priority    || 'normal',
                contractFn:  options.contractFn  || null,
            },
            timestamp: Date.now(),
            status:    'queued',
        };

        this.queue.push(message);
        this.stats.messages++;
        this._updateMetrics();

        return new Promise((resolve, reject) => {
            this.subscribers.set(message.id, { resolve, reject });

            setTimeout(() => {
                if (this.subscribers.has(message.id)) {
                    this.subscribers.get(message.id).reject(new Error('TIMEOUT'));
                    this.subscribers.delete(message.id);
                    this.stats.errors++;
                }
            }, message.options.timeout);
        });
    }

    async _processQueue() {
        if (this.queue.length === 0) return;

        this.queue.sort((a, b) => {
            const p = { high: 0, normal: 1, low: 2 };
            return p[a.options.priority] - p[b.options.priority];
        });

        const message = this.queue.shift();
        message.status = 'processing';
        this.activeJobs.set(message.id, message);
        this._updateMetrics();

        try {
            const result = await this._executeTool(message);
            message.status = 'completed';
            if (this.subscribers.has(message.id)) {
                this.subscribers.get(message.id).resolve(result);
                this.subscribers.delete(message.id);
            }
        } catch (error) {
            message.status = 'failed';
            if (this.subscribers.has(message.id)) {
                this.subscribers.get(message.id).reject(error);
                this.subscribers.delete(message.id);
            }
            this.stats.errors++;
        } finally {
            this.activeJobs.delete(message.id);
            this._updateMetrics();
        }
    }

    async _executeTool(message) {
        if (message.options.contractFn) {
            // Real execution: call the tool's execute function
            return await message.options.contractFn(message.input, message.context);
        }
        // Stub: simulate async latency for visualization
        await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
        return {
            toolId:    message.toolId,
            result:    `[bus-stub] Processed: ${JSON.stringify(message.input).substring(0, 50)}`,
            timestamp: Date.now(),
        };
    }

    cancel(messageId) {
        const idx = this.queue.findIndex(m => m.id === messageId);
        if (idx >= 0) { this.queue.splice(idx, 1); return true; }
        if (this.activeJobs.has(messageId)) {
            this.activeJobs.get(messageId).status = 'cancelling';
            return true;
        }
        return false;
    }

    _updateMetrics() {
        if (this.onMetricsUpdate) {
            this.onMetricsUpdate(this.queue.length, this.activeJobs.size);
        }
    }

    dispose() {
        clearInterval(this._processInterval);
    }
}
