/**
 * CapabilityACL - Token-based permission enforcement.
 *
 * Checks agent capability claims against required tool permissions,
 * enforces rate limits, and blocks forbidden tool combinations.
 */
export class CapabilityACL {
    constructor() {
        this.forbiddenCombinations = [
            ['tool:network',          'tool:code:exec'],   // prevent data exfiltration
            ['tool:filesystem:write', 'meta:spawn'],        // prevent colony poisoning
            ['tool:research',         'tool:email:send'],   // prevent phishing
        ];
    }

    /**
     * Check if an agent is allowed to invoke a tool.
     * @param {object}   agentClaims     - JWT-like claims object
     * @param {string}   toolId
     * @param {string[]} toolCapabilities - declared by tool (unused, reserved)
     * @returns {{ allowed: boolean, reason?: string, ... }}
     */
    checkCapability(agentClaims, toolId, toolCapabilities = []) {
        const agentCaps = agentClaims.capabilities || [];
        const required  = this._requiredCapFor(toolId);

        const hasCapability = agentCaps.some(cap =>
            cap === required ||
            cap === 'tool:*' ||
            cap.startsWith(required + ':')
        );

        if (!hasCapability) {
            return { allowed: false, reason: 'PERMISSION_DENIED', missing: required };
        }

        const rateCheck = this._checkRateLimit(agentClaims, toolId);
        if (!rateCheck.allowed) {
            return { allowed: false, reason: 'RATE_LIMIT_EXCEEDED', resetTime: rateCheck.resetTime };
        }

        const activeTools = agentClaims.activeTools || [];
        const forbidden   = this._checkForbidden([...activeTools, toolId]);
        if (forbidden) {
            return { allowed: false, reason: 'FORBIDDEN_COMBINATION', details: forbidden };
        }

        return { allowed: true, remaining: rateCheck.remaining };
    }

    generateClaims(agentType, customCaps = []) {
        const now  = Date.now();
        const base = {
            sub:         `agent-${now}`,
            iat:         now,
            exp:         now + 3_600_000,
            capabilities: [],
            rate_limits:  {},
            activeTools:  [],
        };

        const profiles = {
            queen: {
                capabilities: ['tool:*', 'meta:*', 'bus:admin'],
                rate_limits:  { network: 1000, filesystem: 1000, compute: 1000 },
            },
            worker: {
                capabilities: ['tool:research', 'tool:code:exec', 'tool:filesystem:temp', ...customCaps],
                rate_limits:  { research: 100, network: 10, filesystem: 100, compute: 50 },
            },
            drone: {
                capabilities: ['tool:research', 'tool:audit'],
                rate_limits:  { research: 50, network: 0, filesystem: 0, compute: 20 },
            },
            subcolony: {
                capabilities: ['tool:research', 'tool:code:exec', 'tool:filesystem:isolated'],
                rate_limits:  { network: 100, filesystem: 500, compute: 200 },
            },
        };

        return { ...base, ...(profiles[agentType] || {}) };
    }

    _requiredCapFor(toolId) {
        const map = {
            'web-search':    'tool:research',
            'code-executor': 'tool:code:exec',
            'file-reader':   'tool:filesystem:read',
            'http-client':   'tool:network',
        };
        return map[toolId] || `tool:${toolId}`;
    }

    _checkRateLimit(claims, toolId) {
        const category  = this._categoryOf(toolId);
        const limits    = claims.rate_limits    || {};
        const usage     = claims.current_usage  || {};
        const limit     = limits[category]      ?? 10;
        const current   = usage[category]       ?? 0;

        if (current >= limit) return { allowed: false, resetTime: Date.now() + 60_000 };
        return { allowed: true, remaining: limit - current - 1 };
    }

    _checkForbidden(activeTools) {
        for (const combo of this.forbiddenCombinations) {
            if (combo.every(t => activeTools.includes(t))) return combo;
        }
        return null;
    }

    _categoryOf(toolId) {
        const map = {
            'web-search':    'research',   // read-only lookup — not raw network
            'http-client':   'network',    // raw HTTP — higher privilege
            'file-reader':   'filesystem',
            'code-executor': 'compute',
        };
        return map[toolId] || 'general';
    }
}
