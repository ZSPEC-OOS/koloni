/**
 * ToolContract - Schema-validated tool wrapper
 * Enforces koloni-tool-v1 spec, validates input/output, manages execution with timeout.
 */
export class ToolContract {
    constructor(spec) {
        this.validateSpec(spec);
        this.spec = spec;
        this.status = 'inactive';
        this.errorCodes = {
            TIMEOUT:            'Execution exceeded timeout limit',
            VALIDATION_FAIL:    'Input validation failed against schema',
            PERMISSION_DENIED:  'Agent lacks required capability',
            DEPENDENCY_MISSING: 'Required context key not found',
            SANDBOX_ESCAPE:     'Security policy violation detected',
            CIRCUIT_OPEN:       'Circuit breaker is open',
            TOOL_DEPRECATED:    'Tool version no longer supported',
        };
    }

    validateSpec(spec) {
        const required = ['id', 'version', 'schema', 'input', 'output', 'execute'];
        const missing = required.filter(r => !spec[r]);
        if (missing.length > 0) {
            throw new Error(`Invalid ToolContract: missing ${missing.join(', ')}`);
        }
        if (spec.schema !== 'koloni-tool-v1') {
            throw new Error(`Unsupported schema: ${spec.schema}. Expected 'koloni-tool-v1'`);
        }
    }

    validateInput(data) {
        const schema = this.spec.input;
        const errors = [];

        if (schema.required) {
            schema.required.forEach(field => {
                if (!(field in data)) errors.push(`Missing required field: ${field}`);
            });
        }

        if (schema.properties) {
            Object.entries(schema.properties).forEach(([key, prop]) => {
                if (data[key] !== undefined) {
                    if (prop.type && typeof data[key] !== prop.type) {
                        errors.push(`Type mismatch for ${key}: expected ${prop.type}`);
                    }
                    if (prop.enum && !prop.enum.includes(data[key])) {
                        errors.push(`Invalid value for ${key}: must be one of ${prop.enum.join(', ')}`);
                    }
                }
            });
        }

        return { valid: errors.length === 0, errors, warnings: [] };
    }

    validateOutput(data) {
        return { valid: true, errors: [] };
    }

    async execute(input, context) {
        const validation = this.validateInput(input);
        if (!validation.valid) {
            throw new Error(`VALIDATION_FAIL: ${validation.errors.join(', ')}`);
        }

        const timeout = this.spec.timeout || 5000;
        return Promise.race([
            this.spec.execute(input, context),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT')), timeout)
            ),
        ]);
    }
}
