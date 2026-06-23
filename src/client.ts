/* Thin async client for the Redmine REST API (issues + time_entries plugin). */

import { validator } from './validation.js';

interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

interface IssuesResponse extends PaginationMeta {
  issues: any[];
}

interface TimeEntriesResponse extends PaginationMeta {
  time_entries: any[];
}

interface ProjectsResponse extends PaginationMeta {
  projects: any[];
}

interface UsersResponse extends PaginationMeta {
  users: any[];
}

export class RedmineAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public body?: any
  ) {
    super(message);
  }
}

export class RedmineClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private parseErrorMessage(statusCode: number, body: string): string {
    try {
      const json = JSON.parse(body);
      if (Array.isArray(json.errors)) {
        // Extract field-specific errors from 422 responses
        const fields = json.errors.map((e: string) => {
          return e;
        });
        return fields.join('\n');
      }
      if (json.errors) {
        return typeof json.errors === 'string' ? json.errors : JSON.stringify(json.errors);
      }
    } catch (e) {
      // Not JSON, return raw body
    }
    return body || `HTTP ${statusCode}`;
  }

  private getErrorHint(statusCode: number, message: string): string {
    if (statusCode !== 422) return '';

    const hints: Record<string, string> = {
      'project: not found': 'Use list_projects to find valid project_id (must be numeric)',
      'tracker: not found': 'tracker_id must be numeric and valid for your Redmine instance',
      'status: not found': 'Use numeric status_id (status strings like "open"/"closed" only work in list filters, not in create/update)',
      'priority: not found': 'priority_id must be numeric and valid for your Redmine instance',
      'assigned_to: not found': 'Use numeric user_id from list_users (not username); alternatively use "me" for current user',
      'spent_on: has invalid format': 'Use YYYY-MM-DD format for date fields',
      'Either issue_id or project_id must be provided': 'Time entry must reference either an issue_id OR a project_id, but not both',
      'parent_issue_id: not found': 'Ensure parent_issue_id is a valid numeric issue ID',
    };

    for (const [error, hint] of Object.entries(hints)) {
      if (message.toLowerCase().includes(error.toLowerCase())) {
        return `\n💡 Hint: ${hint}`;
      }
    }
    return '';
  }

  private async request(method: string, path: string, options: any = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'X-Redmine-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        timeout: 15000,
        ...options,
      });

      if (!response.ok) {
        const text = await response.text();
        const errorMsg = this.parseErrorMessage(response.status, text);
        const hint = this.getErrorHint(response.status, errorMsg);

        let fullMessage = `Redmine API error on ${method} ${path}:\n${errorMsg}`;

        // Add status-specific context
        if (response.status === 401) {
          fullMessage += '\n💡 Hint: Check your API key (REDMINE_API_KEY environment variable)';
        } else if (response.status === 403) {
          fullMessage += '\n💡 Hint: Your API key lacks permission for this operation';
        } else if (response.status === 404 && path.includes('time_entries')) {
          fullMessage += '\n💡 Hint: Time entries may not be available. The time_entries plugin may not be enabled on this Redmine instance.';
        }

        if (hint) {
          fullMessage += hint;
        }

        throw new RedmineAPIError(fullMessage, response.status, text);
      }

      const text = await response.text();
      if (!text || text.length === 0) {
        return {};
      }

      return JSON.parse(text);
    } catch (error: any) {
      if (error instanceof RedmineAPIError) {
        throw error;
      }
      throw new RedmineAPIError(
        `Redmine API request failed on ${method} ${path}: ${error.message}`
      );
    }
  }

  private cleanParams(params: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  private buildQueryString(params: Record<string, any>): string {
    const cleaned = this.cleanParams(params);
    const parts: string[] = [];

    for (const [key, value] of Object.entries(cleaned)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
        }
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }

    return parts.length > 0 ? `?${parts.join('&')}` : '';
  }

  /* --- Issues --- */

  async getCurrentUser(): Promise<any> {
    const data = await this.request('GET', '/users/current.json');
    return data.user;
  }

  async listUsers(options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<UsersResponse> {
    const { limit = 25, offset = 0 } = options;

    // Validate pagination parameters
    validator.validateLimit(limit);
    validator.validateOffset(offset);

    const params = {
      limit: Math.min(limit, 100),
      offset,
    };

    const qs = this.buildQueryString(params);
    const data = await this.request('GET', `/users.json${qs}`);

    return {
      users: data.users || [],
      total: data.total_count || 0,
      limit: data.limit || limit,
      offset: data.offset || offset,
    };
  }

  async getIssue(issueId: number, include?: string): Promise<any> {
    // Validate parameters
    validator.validateIssueId(issueId);
    if (include) {
      validator.validateInclude(include);
    }

    const params = include ? { include } : {};
    const qs = this.buildQueryString(params);
    const data = await this.request('GET', `/issues/${issueId}.json${qs}`);
    return data.issue;
  }

  async listIssues(options: {
    assigned_to_id?: number | string;
    project_id?: number;
    status_id?: string;
    query?: string;
    limit?: number;
    offset?: number;
    sort?: string;
  } = {}): Promise<IssuesResponse> {
    const {
      assigned_to_id,
      project_id,
      status_id,
      query,
      limit = 25,
      offset = 0,
      sort = 'priority:desc,updated_on:desc',
    } = options;

    // Validate parameters
    if (assigned_to_id !== undefined) {
      validator.validateUserId(assigned_to_id, 'assigned_to_id');
    }
    if (project_id !== undefined) {
      validator.validateProjectId(project_id);
    }
    if (status_id !== undefined) {
      validator.validateStatusId(status_id, true); // true = in filter context
    }
    if (query !== undefined) {
      validator.validateQueryString(query);
    }
    validator.validateLimit(limit);
    validator.validateOffset(offset);

    const params = {
      assigned_to_id,
      project_id,
      status_id: status_id || '*',
      q: query,
      limit: Math.min(limit, 100),
      offset,
      sort,
    };

    const qs = this.buildQueryString(params);
    const data = await this.request('GET', `/issues.json${qs}`);

    return {
      issues: data.issues || [],
      total: data.total_count || 0,
      limit: data.limit || limit,
      offset: data.offset || offset,
    };
  }

  async createIssue(options: {
    project_id: number;
    subject: string;
    description?: string;
    tracker_id?: number;
    status_id?: number;
    priority_id?: number;
    assigned_to_id?: number;
    parent_issue_id?: number;
  }): Promise<any> {
    // Validate required fields
    validator.validateProjectId(options.project_id);
    validator.validateSubject(options.subject);

    // Validate optional fields
    if (options.description !== undefined) {
      validator.validateDescription(options.description);
    }
    if (options.tracker_id !== undefined) {
      validator.validateTrackerId(options.tracker_id);
    }
    if (options.status_id !== undefined) {
      validator.validateStatusId(options.status_id, false); // false = not in filter context
    }
    if (options.priority_id !== undefined) {
      validator.validatePriorityId(options.priority_id);
    }
    if (options.assigned_to_id !== undefined) {
      validator.validateUserId(options.assigned_to_id, 'assigned_to_id');
    }
    if (options.parent_issue_id !== undefined) {
      validator.validateIssueId(options.parent_issue_id);
    }

    const issue = this.cleanParams({
      project_id: options.project_id,
      subject: options.subject,
      description: options.description,
      tracker_id: options.tracker_id,
      status_id: options.status_id,
      priority_id: options.priority_id,
      assigned_to_id: options.assigned_to_id,
      parent_issue_id: options.parent_issue_id,
    });

    const data = await this.request('POST', '/issues.json', {
      body: JSON.stringify({ issue }),
    });

    return data.issue;
  }

  async updateIssue(options: {
    issue_id: number;
    status_id?: number;
    assigned_to_id?: number | string;
    notes?: string;
    done_ratio?: number;
  }): Promise<void> {
    // Validate issue_id
    validator.validateIssueId(options.issue_id);

    // Validate optional fields
    if (options.status_id !== undefined) {
      validator.validateStatusId(options.status_id, false); // not in filter context
    }
    if (options.assigned_to_id !== undefined) {
      validator.validateUserId(options.assigned_to_id, 'assigned_to_id');
    }
    if (options.done_ratio !== undefined) {
      validator.validateDoneRatio(options.done_ratio);
    }
    // notes is just a string, no specific validation needed

    const issue = this.cleanParams({
      status_id: options.status_id,
      assigned_to_id: options.assigned_to_id,
      notes: options.notes,
      done_ratio: options.done_ratio,
    });

    await this.request('PUT', `/issues/${options.issue_id}.json`, {
      body: JSON.stringify({ issue }),
    });
  }

  async addIssueNote(issueId: number, notes: string): Promise<void> {
    await this.request('PUT', `/issues/${issueId}.json`, {
      body: JSON.stringify({ issue: { notes } }),
    });
  }

  /* --- Projects --- */

  async listProjects(options: {
    limit?: number;
    offset?: number;
    search?: string;
  } = {}): Promise<ProjectsResponse> {
    const { limit = 25, offset = 0, search } = options;

    // Validate pagination parameters
    validator.validateLimit(limit);
    validator.validateOffset(offset);

    // If searching, paginate through all projects and filter in memory
    if (search) {
      const searchLower = search.toLowerCase();
      const allProjects: any[] = [];
      let currentOffset = 0;
      const pageSize = 100;

      // Fetch all projects and filter by search term
      while (true) {
        const params = {
          limit: pageSize,
          offset: currentOffset,
        };

        const qs = this.buildQueryString(params);
        const data = await this.request('GET', `/projects.json${qs}`);
        const projects = data.projects || [];

        if (projects.length === 0) {
          break;
        }

        // Filter projects matching search (search in name, identifier, or description)
        const filtered = projects.filter((p: any) => {
          const name = (p.name || '').toLowerCase();
          const identifier = (p.identifier || '').toLowerCase();
          const description = (p.description || '').toLowerCase();
          return (
            name.includes(searchLower) ||
            identifier.includes(searchLower) ||
            description.includes(searchLower)
          );
        });

        allProjects.push(...filtered);

        // Stop if we've fetched all projects or already have more than we need
        if (projects.length < pageSize || allProjects.length >= limit * 10) {
          break;
        }

        currentOffset += pageSize;
      }

      // Apply pagination to search results
      const paginatedProjects = allProjects.slice(offset, offset + limit);

      return {
        projects: paginatedProjects,
        total: allProjects.length,
        limit: Math.min(limit, paginatedProjects.length),
        offset,
      };
    }

    // Regular pagination without search
    const params = {
      limit: Math.min(limit, 100),
      offset,
    };

    const qs = this.buildQueryString(params);
    const data = await this.request('GET', `/projects.json${qs}`);

    return {
      projects: data.projects || [],
      total: data.total_count || 0,
      limit: data.limit || limit,
      offset: data.offset || offset,
    };
  }

  /* --- Wiki --- */

  async getProjectWiki(projectId: number | string, title: string = 'Wiki'): Promise<any> {
    // Validate parameters
    if (typeof projectId !== 'string' && !Number.isInteger(projectId)) {
      throw new Error('project_id must be numeric or string identifier');
    }
    validator.validateWikiTitle(title);

    const data = await this.request('GET', `/projects/${projectId}/wiki/${title}.json`);
    return data.wiki_page;
  }

  async listWikiPages(projectId: number | string): Promise<any[]> {
    const data = await this.request('GET', `/projects/${projectId}/wiki/index.json`);
    return data.wiki_pages || [];
  }

  /* --- Time entries (requires the time_entries plugin/REST module enabled) --- */

  async listTimeEntries(options: {
    user_id?: number | string;
    project_id?: number;
    issue_id?: number;
    from_date?: string;
    to_date?: string;
    period?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<TimeEntriesResponse> {
    const {
      user_id,
      project_id,
      issue_id,
      from_date,
      to_date,
      period,
      limit = 25,
      offset = 0,
    } = options;

    // Validate parameters
    if (user_id !== undefined) {
      validator.validateUserId(user_id, 'user_id');
    }
    if (project_id !== undefined) {
      validator.validateProjectId(project_id);
    }
    if (issue_id !== undefined) {
      validator.validateIssueId(issue_id);
    }
    if (period && (from_date || to_date)) {
      throw new Error('Specify either period OR date range (from_date/to_date), not both');
    }
    if (period) {
      validator.validatePeriod(period);
    }
    if (from_date || to_date) {
      validator.validateFromDate(from_date, to_date);
    }
    validator.validateLimit(limit);
    validator.validateOffset(offset);

    const params: Record<string, any> = {
      user_id,
      project_id,
      issue_id,
      limit: Math.min(limit, 100),
      offset,
    };

    if (period) {
      params['f[]'] = 'spent_on';
      params['op[spent_on]'] = period;
    } else if (from_date || to_date) {
      params['f[]'] = 'spent_on';
      params['op[spent_on]'] = '><';
      params['v[spent_on][]'] = [from_date || '', to_date || ''];
    }

    const qs = this.buildQueryString(params);
    const data = await this.request('GET', `/time_entries.json${qs}`);

    return {
      time_entries: data.time_entries || [],
      total: data.total_count || 0,
      limit: data.limit || limit,
      offset: data.offset || offset,
    };
  }

  async getIssueTimeEntries(
    issueId: number,
    limit: number = 25,
    offset: number = 0
  ): Promise<TimeEntriesResponse> {
    // Validate parameters
    validator.validateIssueId(issueId);
    validator.validateLimit(limit);
    validator.validateOffset(offset);

    const params = { limit: Math.min(limit, 100), offset };
    const qs = this.buildQueryString(params);
    const data = await this.request('GET', `/issues/${issueId}/time_entries.json${qs}`);

    return {
      time_entries: data.time_entries || [],
      total: data.total_count || 0,
      limit: data.limit || limit,
      offset: data.offset || offset,
    };
  }

  async createTimeEntry(options: {
    hours: number;
    issue_id?: number;
    project_id?: number;
    activity_id?: number;
    spent_on?: string;
    comments?: string;
  }): Promise<any> {
    // Validate mutually exclusive constraint
    validator.validateIssueIdOrProjectId(options.issue_id, options.project_id);

    // Validate required field
    validator.validateHours(options.hours);

    // Validate optional fields
    if (options.activity_id !== undefined) {
      validator.validatePriorityId(options.activity_id); // activity_id same validation as priority_id
    }
    if (options.spent_on !== undefined) {
      validator.validateSpentOn(options.spent_on);
    }

    const entry = this.cleanParams({
      issue_id: options.issue_id,
      project_id: options.project_id,
      hours: options.hours,
      activity_id: options.activity_id,
      spent_on: options.spent_on,
      comments: options.comments,
    });

    const data = await this.request('POST', '/time_entries.json', {
      body: JSON.stringify({ time_entry: entry }),
    });

    return data.time_entry;
  }
}
