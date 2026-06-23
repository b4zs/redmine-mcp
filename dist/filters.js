/* Filter validation for Redmine REST API list operations
 *
 * Redmine uses a three-parameter filter system:
 *   - f[] : field names
 *   - op[] : operators (=, !=, <, >, <=, >=, ~, !~, <>, ><)
 *   - v[] : values
 *
 * Filters are combined with AND logic. Multiple values for same field use OR (pipe-separated).
 */
/**
 * Validates and builds filters for Redmine list operations.
 * Be careful with:
 *   - Filter operators (different from comparison operators)
 *   - Date range format (start|end with pipe delimiter)
 *   - Status strings (only "open", "closed", "*" in filter context)
 *   - Predefined periods (today, yesterday, current_week, etc.)
 */
export class FilterValidator {
    validOperators = ['=', '!=', '<', '>', '<=', '>=', '~', '!~', '<>', '><'];
    validPeriods = [
        'today',
        'yesterday',
        'current_week',
        'last_week',
        'current_month',
        'last_month',
        'current_year',
    ];
    validStatusFilterValues = ['open', 'closed', '*'];
    /**
     * Validates a complete filter constraint
     */
    validateFilter(field, operator, values) {
        // Validate field name
        if (!field || typeof field !== 'string') {
            throw new Error(`Invalid filter field: must be non-empty string, got "${field}"`);
        }
        // Validate operator
        if (!this.validOperators.includes(operator)) {
            throw new Error(`Invalid operator "${operator}" for field "${field}"; valid operators: ${this.validOperators.join(', ')}`);
        }
        // Normalize values to array
        const valueArray = Array.isArray(values) ? values : [values];
        if (valueArray.length === 0) {
            throw new Error(`No values provided for filter field "${field}"`);
        }
        // Validate values based on field type
        this.validateFilterValues(field, operator, valueArray);
    }
    /**
     * Validates filter values based on field and operator combination
     */
    validateFilterValues(field, operator, values) {
        // Range operator (><) requires exactly 2 values (start|end)
        if (operator === '><') {
            if (values.length === 1) {
                const parts = values[0].split('|');
                if (parts.length !== 2) {
                    throw new Error(`Range filter (><) requires format "start|end" for field "${field}", got "${values[0]}"`);
                }
                // Validate individual parts based on field
                this.validateSingleFilterValue(field, operator, parts[0], 'range start');
                this.validateSingleFilterValue(field, operator, parts[1], 'range end');
                // Validate date range logic
                if (field === 'spent_on' || field === 'created_on' || field === 'updated_on') {
                    if (parts[0] > parts[1]) {
                        throw new Error(`Date range start (${parts[0]}) must be <= end (${parts[1]}) for field "${field}"`);
                    }
                }
            }
        }
        else {
            // Non-range filters: validate each value
            for (const value of values) {
                this.validateSingleFilterValue(field, operator, value);
            }
        }
        // Additional field-specific validation
        if (field === 'status_id') {
            // In filters, status_id can be "open", "closed", "*", or numeric
            for (const value of values) {
                if (!this.validStatusFilterValues.includes(value) && !/^\d+$/.test(value)) {
                    throw new Error(`Invalid status_id filter value "${value}"; must be "open", "closed", "*", or numeric ID`);
                }
            }
        }
        else if (field === 'spent_on') {
            // spent_on can use predefined periods OR dates
            if (operator !== '><') {
                for (const value of values) {
                    if (!this.validPeriods.includes(value) && !this.isValidDate(value)) {
                        throw new Error(`Invalid spent_on filter value "${value}"; must be period (${this.validPeriods.join(', ')}) or YYYY-MM-DD date`);
                    }
                }
            }
        }
    }
    /**
     * Validates a single filter value
     */
    validateSingleFilterValue(field, operator, value, context = 'filter value') {
        if (typeof value !== 'string') {
            throw new Error(`${context} for field "${field}" must be string, got ${typeof value}`);
        }
        if (value.trim().length === 0) {
            throw new Error(`${context} for field "${field}" cannot be empty`);
        }
        // Field-specific validation
        const isNumericField = this.isNumericField(field);
        const isDateField = this.isDateField(field);
        if (isNumericField && operator !== '~' && operator !== '!~') {
            // Numeric fields with non-text operators should contain only digits
            if (!/^\d+$/.test(value)) {
                throw new Error(`${context} for numeric field "${field}" must be digits only, got "${value}"`);
            }
        }
        if (isDateField && operator !== '~' && operator !== '!~' && value !== 'today' &&
            !this.validPeriods.includes(value)) {
            // Date fields should be YYYY-MM-DD format
            if (!this.isValidDate(value)) {
                throw new Error(`${context} for date field "${field}" must be YYYY-MM-DD format, got "${value}"`);
            }
        }
    }
    /**
     * Checks if a field represents numeric data
     */
    isNumericField(field) {
        const numericFields = [
            'project_id',
            'issue_id',
            'user_id',
            'assigned_to_id',
            'tracker_id',
            'status_id',
            'priority_id',
            'category_id',
            'fixed_version_id',
            'updated_on',
            'created_on',
            'done_ratio',
        ];
        return numericFields.includes(field);
    }
    /**
     * Checks if a field represents date data
     */
    isDateField(field) {
        const dateFields = ['spent_on', 'created_on', 'updated_on', 'due_date', 'start_date'];
        return dateFields.includes(field);
    }
    /**
     * Validates YYYY-MM-DD date format and calendar validity
     */
    isValidDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
        }
        const [year, month, day] = value.split('-').map(Number);
        // Check if it's a valid calendar date
        const date = new Date(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`);
        return !isNaN(date.getTime());
    }
    /**
     * Validates period shorthand for time entry filters
     */
    validatePeriod(period) {
        if (!this.validPeriods.includes(period)) {
            throw new Error(`Invalid period "${period}"; must be one of: ${this.validPeriods.join(', ')}`);
        }
    }
}
/**
 * Helper for building filter query string parameters.
 * Returns objects that can be passed to buildQueryString in client.
 *
 * Example:
 *   const filter = new FilterBuilder()
 *     .addEqual('status_id', 'open')
 *     .addEqual('project_id', '1')
 *     .addDateRange('spent_on', '2025-01-01', '2025-12-31')
 *     .build()
 *   // Returns: { 'f[]': ['status_id', 'project_id', 'spent_on'],
 *   //            'op[status_id]': '=', 'op[project_id]': '=', 'op[spent_on]': '><',
 *   //            'v[status_id][]': ['open'], 'v[project_id][]': ['1'], 'v[spent_on][]': ['2025-01-01|2025-12-31'] }
 */
export class FilterBuilder {
    filters = [];
    validator = new FilterValidator();
    /**
     * Add an equality filter
     */
    addEqual(field, value) {
        this.validator.validateFilter(field, '=', String(value));
        this.filters.push({ field, operator: '=', values: [String(value)] });
        return this;
    }
    /**
     * Add an inequality filter (!=)
     */
    addNotEqual(field, value) {
        this.validator.validateFilter(field, '!=', String(value));
        this.filters.push({ field, operator: '!=', values: [String(value)] });
        return this;
    }
    /**
     * Add an OR filter (multiple values; uses <> operator)
     * Example: status_id in [1, 2, 3]
     */
    addIn(field, values) {
        if (!values || values.length === 0) {
            throw new Error(`addIn() requires at least one value for field "${field}"`);
        }
        const strValues = values.map(String);
        this.validator.validateFilter(field, '<>', strValues);
        this.filters.push({ field, operator: '<>', values: strValues });
        return this;
    }
    /**
     * Add a greater-than filter
     */
    addGreaterThan(field, value) {
        this.validator.validateFilter(field, '>', value);
        this.filters.push({ field, operator: '>', values: [value] });
        return this;
    }
    /**
     * Add a less-than filter
     */
    addLessThan(field, value) {
        this.validator.validateFilter(field, '<', value);
        this.filters.push({ field, operator: '<', values: [value] });
        return this;
    }
    /**
     * Add a greater-than-or-equal filter
     */
    addGreaterThanOrEqual(field, value) {
        this.validator.validateFilter(field, '>=', value);
        this.filters.push({ field, operator: '>=', values: [value] });
        return this;
    }
    /**
     * Add a less-than-or-equal filter
     */
    addLessThanOrEqual(field, value) {
        this.validator.validateFilter(field, '<=', value);
        this.filters.push({ field, operator: '<=', values: [value] });
        return this;
    }
    /**
     * Add a date range filter (between start and end date)
     * Operator: ><
     */
    addDateRange(field, startDate, endDate) {
        const rangeValue = `${startDate}|${endDate}`;
        this.validator.validateFilter(field, '><', rangeValue);
        this.filters.push({ field, operator: '><', values: [rangeValue] });
        return this;
    }
    /**
     * Add a contains (substring) filter (~)
     */
    addContains(field, value) {
        this.validator.validateFilter(field, '~', value);
        this.filters.push({ field, operator: '~', values: [value] });
        return this;
    }
    /**
     * Add a not-contains filter (!~)
     */
    addNotContains(field, value) {
        this.validator.validateFilter(field, '!~', value);
        this.filters.push({ field, operator: '!~', values: [value] });
        return this;
    }
    /**
     * Add a period-based filter for spent_on (e.g., "today", "current_week")
     */
    addPeriod(field, period) {
        this.validator.validatePeriod(period);
        this.validator.validateFilter(field, '=', period);
        this.filters.push({ field, operator: '=', values: [period] });
        return this;
    }
    /**
     * Build the filter parameters object ready for query string construction
     * Returns format compatible with client.buildQueryString()
     */
    build() {
        if (this.filters.length === 0) {
            return {};
        }
        const params = {
            'set_filter': 1,
            'f[]': [],
            // op[] and v[] are built per-field below
        };
        for (const filter of this.filters) {
            params['f[]'].push(filter.field);
            params[`op[${filter.field}]`] = filter.operator;
            if (filter.operator === '><') {
                // Date range: single value with pipe delimiter
                params[`v[${filter.field}][]`] = filter.values[0];
            }
            else if (filter.operator === '<>' || filter.values.length > 1) {
                // Multiple values: array
                params[`v[${filter.field}][]`] = filter.values;
            }
            else {
                // Single value
                params[`v[${filter.field}][]`] = filter.values[0];
            }
        }
        return params;
    }
    /**
     * Clear all filters
     */
    clear() {
        this.filters = [];
        return this;
    }
    /**
     * Get current filters (for inspection/debugging)
     */
    getFilters() {
        return [...this.filters];
    }
}
/* --- Export singleton validator instance --- */
export const filterValidator = new FilterValidator();
