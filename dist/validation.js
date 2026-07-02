/* Parameter validation for Redmine REST API calls */
/**
 * Validates a single parameter value against Redmine API constraints.
 * Throws on validation failure with detailed error message.
 */
export class RedmineValidator {
    errors = [];
    /* --- String Validators --- */
    isNonEmptyString(value, fieldName, maxLength) {
        if (typeof value !== 'string') {
            this.addError(fieldName, `must be a string, got ${typeof value}`);
            return false;
        }
        if (value.trim().length === 0) {
            this.addError(fieldName, `cannot be empty`);
            return false;
        }
        if (maxLength && value.length > maxLength) {
            this.addError(fieldName, `is too long (maximum is ${maxLength} characters, got ${value.length})`);
            return false;
        }
        return true;
    }
    /* --- Number Validators --- */
    isPositiveInteger(value, fieldName, allowZero = false) {
        if (!Number.isInteger(value)) {
            this.addError(fieldName, `must be an integer, got ${typeof value}: ${value}`);
            return false;
        }
        if (value < 0 || (value === 0 && !allowZero)) {
            this.addError(fieldName, `must be positive, got ${value}`);
            return false;
        }
        return true;
    }
    isPositiveNumber(value, fieldName) {
        if (typeof value !== 'number') {
            this.addError(fieldName, `must be a number, got ${typeof value}`);
            return false;
        }
        if (value <= 0) {
            this.addError(fieldName, `must be positive, got ${value}`);
            return false;
        }
        return true;
    }
    isInRange(value, fieldName, min, max) {
        if (!Number.isInteger(value)) {
            this.addError(fieldName, `must be an integer, got ${typeof value}`);
            return false;
        }
        if (value < min || value > max) {
            this.addError(fieldName, `must be between ${min} and ${max}, got ${value}`);
            return false;
        }
        return true;
    }
    /* --- Date Validators --- */
    isYYYYMMDDDate(value, fieldName) {
        if (typeof value !== 'string') {
            this.addError(fieldName, `must be a string in YYYY-MM-DD format, got ${typeof value}`);
            return false;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            this.addError(fieldName, `must be in YYYY-MM-DD format, got "${value}"`);
            return false;
        }
        // Validate it's a valid calendar date
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`);
        if (isNaN(date.getTime())) {
            this.addError(fieldName, `is not a valid calendar date: "${value}"`);
            return false;
        }
        return true;
    }
    /* --- Special Value Validators --- */
    isUserIdOrMe(value, fieldName) {
        if (typeof value === 'string' && value === 'me') {
            return true;
        }
        return this.isPositiveInteger(value, fieldName);
    }
    statusMapping = {
        'new': 1,
        'assigned': 2,
        'in_progress': 7,
        'test_needed': 8,
        'feedback': 4,
        'feedback_needed': 9,
        'waiting_for_deploy': 10,
        'resolved': 3,
        'closed': 5,
        'rejected': 6,
    };
    normalizeStatusId(status) {
        if (typeof status === 'number') {
            return status;
        }
        if (typeof status === 'string') {
            const lower = status.toLowerCase();
            if (lower in this.statusMapping) {
                return this.statusMapping[lower];
            }
            // Try to parse as number
            const num = parseInt(status, 10);
            if (!isNaN(num) && num > 0) {
                return num;
            }
        }
        throw new Error(`Invalid status: ${status}. Use numeric ID or one of: ${Object.keys(this.statusMapping).join(', ')}`);
    }
    isStatusIdOrFilter(value, fieldName, inFilter = false) {
        try {
            this.normalizeStatusId(value);
            return true;
        }
        catch {
            return false;
        }
    }
    /* --- Public Validation Methods --- */
    validateProjectId(projectId) {
        this.errors = [];
        if (!this.isPositiveInteger(projectId, 'project_id')) {
            throw this.getValidationError('project_id must be a numeric ID from list_projects');
        }
    }
    validateIssueId(issueId) {
        this.errors = [];
        if (!this.isPositiveInteger(issueId, 'issue_id')) {
            throw this.getValidationError('issue_id must be a numeric ID');
        }
    }
    validateUserId(userId, fieldName = 'user_id') {
        this.errors = [];
        if (!this.isUserIdOrMe(userId, fieldName)) {
            throw this.getValidationError(`${fieldName} must be a numeric ID from list_users or "me"`);
        }
    }
    validateStatusId(statusId, inFilterContext = false) {
        this.errors = [];
        if (!this.isStatusIdOrFilter(statusId, 'status_id', inFilterContext)) {
            throw this.getValidationError(`status_id must be numeric or one of: ${Object.keys(this.statusMapping).join(', ')}`);
        }
    }
    validateStatusIds(statusIds, inFilterContext = false) {
        this.errors = [];
        if (!Array.isArray(statusIds)) {
            throw this.getValidationError('status_ids must be an array');
        }
        if (statusIds.length === 0) {
            throw this.getValidationError('status_ids must contain at least one status ID');
        }
        for (const statusId of statusIds) {
            if (!this.isStatusIdOrFilter(statusId, 'status_ids', inFilterContext)) {
                throw this.getValidationError(`status_ids contains invalid value "${statusId}"; must be numeric or one of: ${Object.keys(this.statusMapping).join(', ')}`);
            }
        }
    }
    normalizeStatus(status) {
        return this.normalizeStatusId(status);
    }
    validateTrackerId(trackerId) {
        this.errors = [];
        if (!this.isPositiveInteger(trackerId, 'tracker_id')) {
            throw this.getValidationError('tracker_id must be numeric; instance-specific values vary');
        }
    }
    validatePriorityId(priorityId) {
        this.errors = [];
        if (!this.isPositiveInteger(priorityId, 'priority_id')) {
            throw this.getValidationError('priority_id must be numeric; instance-specific values vary');
        }
    }
    validateHours(hours) {
        this.errors = [];
        if (!this.isPositiveNumber(hours, 'hours')) {
            throw this.getValidationError(`hours must be a positive number (e.g., 1.5 for 1h 30m), got ${hours}`);
        }
    }
    validateDoneRatio(doneRatio) {
        this.errors = [];
        if (!this.isInRange(doneRatio, 'done_ratio', 0, 100)) {
            throw this.getValidationError(`done_ratio must be between 0 and 100`);
        }
    }
    validateSpentOn(spentOn) {
        this.errors = [];
        if (!this.isYYYYMMDDDate(spentOn, 'spent_on')) {
            throw this.getValidationError(`spent_on must be in YYYY-MM-DD format, got "${spentOn}"`);
        }
    }
    validateSubject(subject) {
        this.errors = [];
        if (!this.isNonEmptyString(subject, 'subject', 255)) {
            throw this.getValidationError(`subject is required and must be <= 255 characters`);
        }
    }
    validateDescription(description) {
        this.errors = [];
        if (description !== undefined && description !== null) {
            if (typeof description !== 'string') {
                this.addError('description', 'must be a string if provided');
                throw this.getValidationError('description must be a string');
            }
        }
    }
    validateFromDate(fromDate, toDate) {
        this.errors = [];
        if (fromDate) {
            if (!this.isYYYYMMDDDate(fromDate, 'from_date')) {
                throw this.getValidationError('from_date must be in YYYY-MM-DD format');
            }
        }
        if (toDate) {
            if (!this.isYYYYMMDDDate(toDate, 'to_date')) {
                throw this.getValidationError('to_date must be in YYYY-MM-DD format');
            }
        }
        // Validate date range logic
        if (fromDate && toDate) {
            if (fromDate > toDate) {
                throw this.getValidationError('from_date must be <= to_date');
            }
        }
    }
    validatePeriod(period) {
        this.errors = [];
        const validPeriods = [
            'today',
            'yesterday',
            'current_week',
            'last_week',
            'current_month',
            'last_month',
            'current_year',
        ];
        if (!validPeriods.includes(period)) {
            throw this.getValidationError(`period must be one of: ${validPeriods.join(', ')}, got "${period}"`);
        }
    }
    validateLimit(limit) {
        this.errors = [];
        if (!this.isInRange(limit, 'limit', 1, 100)) {
            throw this.getValidationError(`limit must be between 1 and 100`);
        }
    }
    validateOffset(offset) {
        this.errors = [];
        if (!this.isInRange(offset, 'offset', 0, Number.MAX_SAFE_INTEGER)) {
            throw this.getValidationError(`offset must be non-negative`);
        }
    }
    /**
     * Validates mutually exclusive constraint: either issue_id or project_id, but not both, not neither
     */
    validateIssueIdOrProjectId(issueId, projectId) {
        this.errors = [];
        if (!issueId && !projectId) {
            throw this.getValidationError('Either issue_id or project_id must be provided (but not both)');
        }
        if (issueId && projectId) {
            throw this.getValidationError('Provide either issue_id or project_id, not both');
        }
    }
    /**
     * Validates query string for list operations
     */
    validateQueryString(query) {
        this.errors = [];
        if (typeof query !== 'string' || query.trim().length === 0) {
            throw this.getValidationError('query must be a non-empty string');
        }
    }
    /**
     * Validates wiki page title
     */
    validateWikiTitle(title) {
        this.errors = [];
        if (typeof title !== 'string' || title.trim().length === 0) {
            throw this.getValidationError('wiki title must be a non-empty string');
        }
        if (title.length > 255) {
            throw this.getValidationError('wiki title is too long (maximum is 255 characters)');
        }
    }
    /**
     * Validates include parameter (comma-separated list)
     */
    validateInclude(include) {
        this.errors = [];
        if (include) {
            if (typeof include !== 'string') {
                this.addError('include', 'must be a string');
            }
            const valid = ['journals', 'attachments', 'relations', 'children'];
            const parts = include.split(',').map((s) => s.trim());
            for (const part of parts) {
                if (!valid.includes(part)) {
                    this.addError('include', `unknown value "${part}"; valid: ${valid.join(', ')}`);
                }
            }
        }
    }
    /**
     * Validates custom fields format
     * Custom fields should be passed as: [{"id": <numeric>, "value": "<string_or_array>"}]
     */
    validateCustomFields(customFields) {
        this.errors = [];
        if (!Array.isArray(customFields)) {
            throw this.getValidationError('custom_fields must be an array');
        }
        for (let i = 0; i < customFields.length; i++) {
            const field = customFields[i];
            if (!field.id) {
                this.addError(`custom_fields[${i}]`, 'missing required "id" field');
            }
            else if (!this.isPositiveInteger(field.id, `custom_fields[${i}].id`)) {
                continue; // error already added
            }
            if (field.value === undefined) {
                this.addError(`custom_fields[${i}]`, 'missing required "value" field');
            }
            // Note: value can be string, number (passed as string), array, or boolean
            // We don't deeply validate here as Redmine instance may have custom field types
        }
        if (this.errors.length > 0) {
            throw this.getValidationError('custom_fields format is invalid');
        }
    }
    /* --- Helper Methods --- */
    addError(field, message, value) {
        this.errors.push({ field, message, value });
    }
    getValidationError(message) {
        const fullMessage = this.errors.length > 0
            ? `${this.errors.map((e) => `${e.field}: ${e.message}`).join('\n')}\n\n${message}`
            : message;
        const error = new Error(fullMessage);
        error.name = 'ValidationError';
        return error;
    }
}
/* --- Export singleton instance --- */
export const validator = new RedmineValidator();
