/**
 * Query builder for Redmine REST API.
 * Handles proper URL parameter construction including filter arrays (f[], op[], v[])
 * with correct ordering that Redmine requires, and generates the final query string.
 */

export interface FilterParam {
  field: string;
  operator: string;
  values?: (string | number)[];
}

export class QueryBuilder {
  private filters: Map<string, FilterParam> = new Map();
  private params: Record<string, any> = {};

  /**
   * Add a filter with field, operator, and optional values
   * Examples:
   *   addFilter('status_id', 'o')  // open status, no value needed
   *   addFilter('project_id', '=', [890])
   *   addFilter('spent_on', '><', ['2026-01-01', '2026-12-31'])
   */
  public addFilter(field: string, operator: string, values?: (string | number)[]): this {
    this.filters.set(field, {
      field,
      operator,
      values: values || []
    });
    return this;
  }

  /**
   * Add a simple query parameter
   */
  public addParam(key: string, value: any): this {
    if (value !== null && value !== undefined) {
      this.params[key] = value;
    }
    return this;
  }

  /**
   * Build the params object suitable for query string construction
   * Returns structure like:
   *   { f[]: ['field1', 'field2'], op[field1]: 'op1', v[field1][]: value1, ...otherParams }
   */
  public buildParams(): Record<string, any> {
    const result: Record<string, any> = { ...this.params };

    if (this.filters.size === 0) {
      return result;
    }

    const filterArray: string[] = [];
    const filters = Array.from(this.filters.values());

    // Build filter arrays in order
    for (const filter of filters) {
      filterArray.push(filter.field);
      result[`op[${filter.field}]`] = filter.operator;

      // Only add v[] if there are values
      if (filter.values && filter.values.length > 0) {
        if (filter.values.length === 1 && filter.operator !== '<>') {
          // Single value
          result[`v[${filter.field}][]`] = filter.values[0];
        } else {
          // Multiple values - array
          result[`v[${filter.field}][]`] = filter.values;
        }
      }
    }

    result['f[]'] = filterArray;
    return result;
  }

  /**
   * Build the complete query string with proper encoding and parameter ordering
   * Handles filter arrays (f[], op[], v[]) specially to maintain Redmine's required order
   */
  public buildQueryString(): string {
    const params = this.buildParams();
    const parts: string[] = [];

    // Handle filter arrays specially: all f[] first, then all op[], then all v[]
    if (params['f[]']) {
      const filters = Array.isArray(params['f[]']) ? params['f[]'] : [params['f[]']];
      
      // Add all filters
      for (const filter of filters) {
        parts.push(`f[]=${encodeURIComponent(filter)}`);
      }
      
      // Add all operators
      for (const filter of filters) {
        const op = params[`op[${filter}]`];
        if (op) {
          parts.push(`op[${encodeURIComponent(filter)}]=${encodeURIComponent(op)}`);
        }
      }
      
      // Add all values
      for (const filter of filters) {
        const val = params[`v[${filter}][]`];
        if (val) {
          const values = Array.isArray(val) ? val : [val];
          for (const v of values) {
            parts.push(`v[${encodeURIComponent(filter)}][]=${encodeURIComponent(v)}`);
          }
        }
      }
      
      // Add remaining params (non-filter related)
      for (const [key, value] of Object.entries(params)) {
        if (!key.startsWith('f[') && !key.startsWith('op[') && !key.startsWith('v[')) {
          if (Array.isArray(value)) {
            for (const v of value) {
              parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
            }
          } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
          }
        }
      }
    } else {
      // No filters - just add regular params
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
          }
        } else {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
        }
      }
    }

    return parts.length > 0 ? `?${parts.join('&')}` : '';
  }

  /**
   * Clear all filters and params
   */
  public clear(): this {
    this.filters.clear();
    this.params = {};
    return this;
  }

  /**
   * Get current state for debugging
   */
  public getState(): { filters: FilterParam[]; params: Record<string, any> } {
    return {
      filters: Array.from(this.filters.values()),
      params: { ...this.params }
    };
  }
}

