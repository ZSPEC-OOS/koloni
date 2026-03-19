/**
 * ContextManager - 4-scope shared state with inheritance and snapshotting.
 *
 * Scope hierarchy (inner → outer): private → agent → colony → global
 * get() walks from inner to outer; set() targets a specific scope.
 *
 * Pass an onUpdate callback to hook UI updates without coupling to DOM.
 */
export class ContextManager {
    constructor(onUpdate = null) {
        this.scopes = {
            global:  new Map(),
            colony:  new Map(),
            agent:   new Map(),
            private: new Map(),
        };
        this.snapshots  = [];
        this.inheritance = ['private', 'agent', 'colony', 'global'];
        this.onUpdate   = onUpdate; // (scope, key, value, isNew) => void
    }

    /** Returns { value, scope } or undefined if not found. */
    get(key, preferredScope = null) {
        if (preferredScope && this.scopes[preferredScope]?.has(key)) {
            return { value: this.scopes[preferredScope].get(key), scope: preferredScope };
        }
        for (const scope of this.inheritance) {
            if (this.scopes[scope].has(key)) {
                return { value: this.scopes[scope].get(key), scope };
            }
        }
        return undefined;
    }

    /** Convenience method — returns the raw value (not the {value,scope} wrapper). */
    getValue(key, preferredScope = null) {
        const result = this.get(key, preferredScope);
        return result ? result.value : undefined;
    }

    set(key, value, scope = 'colony') {
        if (!this.scopes[scope]) throw new Error(`Invalid scope: ${scope}`);
        const isNew = !this.scopes[scope].has(key);
        this.scopes[scope].set(key, value);
        if (this.onUpdate) this.onUpdate(scope, key, value, isNew);
        return { scope, key, value };
    }

    /** Creates an immutable snapshot of all scopes for rollback. */
    fork() {
        const snapshot = { timestamp: Date.now(), data: {} };
        this.inheritance.forEach(scope => {
            snapshot.data[scope] = new Map(this.scopes[scope]);
        });
        this.snapshots.push(snapshot);
        return snapshot;
    }

    /** Restores all scopes from a snapshot. */
    merge(snapshot) {
        Object.keys(snapshot.data).forEach(scope => {
            this.scopes[scope] = new Map(snapshot.data[scope]);
        });
        if (this.onUpdate) {
            this.inheritance.forEach(scope => {
                this.scopes[scope].forEach((value, key) => {
                    this.onUpdate(scope, key, value, false);
                });
            });
        }
    }

    /**
     * Returns a restricted context proxy for tool execution.
     * Tools may only write to 'private' or 'agent' scope.
     */
    createScopedContext(agentId, toolInstance) {
        return {
            agentId,
            toolInstance,
            get:      (key)               => this.get(key),
            getValue: (key)               => this.getValue(key),
            set:      (key, value, scope) => {
                if (scope === 'private' || scope === 'agent') return this.set(key, value, scope);
                throw new Error(`Tool cannot write to ${scope} scope`);
            },
            fork:     ()     => this.fork(),
            require:  (keys) => {
                const missing = keys.filter(k => this.get(k) === undefined);
                if (missing.length > 0) {
                    throw new Error(`DEPENDENCY_MISSING: ${missing.join(', ')}`);
                }
                return keys.map(k => this.getValue(k));
            },
        };
    }
}
