/* Thin async client for the Redmine REST API (issues + time_entries plugin). */

import { promises as fs } from 'fs';
import { validator } from './validation.js';
import { QueryBuilder } from './query-builder.js';

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
        credentials: 'include',
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

  // Query building is now handled by QueryBuilder class
  // This helper converts legacy params to QueryBuilder for backward compatibility
  private buildQueryStringFromParams(params: Record<string, any>): string {
    const qb = new QueryBuilder();
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        qb.addParam(key, value);
      }
    }
    return qb.buildQueryString();
  }


  private async save_result_to_file(data: any): Promise<string> {
    const timestamp = Date.now();
    const filename = `/tmp/redmine_result_${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
    return filename;
  }

  async readSavedFile(filepath: string): Promise<any> {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      throw new RedmineAPIError(`Failed to read file: ${error.message}`);
    }
  }

  private async paginate_all_results(
    endpoint: string,
    params: Record<string, any>,
    response_key: string
  ): Promise<any[]> {
    const all_results: any[] = [];
    let current_offset = 0;
    const page_size = 100;

    while (true) {
      const page_params = { ...params, limit: page_size, offset: current_offset };
      const qs = this.buildQueryStringFromParams(page_params);
      const data = await this.request('GET', `${endpoint}${qs}`);

      const items = data[response_key] || [];
      if (items.length === 0) break;

      all_results.push(...items);

      if (data.total_count && current_offset + page_size >= data.total_count) {
        break;
      }

      current_offset += page_size;
    }

    return all_results;
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

    const qs = this.buildQueryStringFromParams(params);
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

    const qb = new QueryBuilder();
    if (include) {
      qb.addParam('include', include);
    }
    const qs = qb.buildQueryString();
    const data = await this.request('GET', `/issues/${issueId}.json${qs}`);
    return data.issue;
  }

  async listIssues(options: {
    assigned_to_id?: number | string;
    project_id?: number;
    project_ids?: number[];
    status_id?: string | (number | string)[];
    updated_on?: string;
    query?: string;
    limit?: number;
    offset?: number;
    sort?: string;
    paginate?: boolean;
    save_to_file?: boolean;
  } = {}): Promise<IssuesResponse> {
    const {
      assigned_to_id,
      project_id,
      project_ids,
      status_id,
      updated_on,
      query,
      limit = 25,
      offset = 0,
      sort = 'priority:desc,updated_on:desc',
      paginate = false,
      save_to_file = false,
    } = options;

    // Validate parameters
    if (assigned_to_id !== undefined) {
      validator.validateUserId(assigned_to_id, 'assigned_to_id');
    }
    if (project_id !== undefined) {
      validator.validateProjectId(project_id);
    }
    if (project_ids !== undefined) {
      project_ids.forEach(pid => validator.validateProjectId(pid));
    }
    if (status_id !== undefined) {
      // Validate each status_id value
      const statusIds = Array.isArray(status_id) ? status_id : [status_id];
      statusIds.forEach(sid => validator.validateStatusId(sid, true)); // true = in filter context
    }
    if (query !== undefined) {
      validator.validateQueryString(query);
    }
    validator.validateLimit(limit);
    validator.validateOffset(offset);

    // Normalize status_id to array format for consistent handling
    const statusIdArray = status_id !== undefined 
      ? (Array.isArray(status_id) ? status_id : [status_id])
      : undefined;

    // Always build with QueryBuilder
    const qb = new QueryBuilder();
    
    if (project_ids && project_ids.length > 0) {
      if (statusIdArray !== undefined) {
        qb.addFilter('status_id', '=', statusIdArray);
      } else {
        qb.addFilter('status_id', 'o');
      }
      qb.addFilter('project_id', '=', project_ids)
        .addParam('set_filter', 1);
    } else {
      if (assigned_to_id !== undefined) qb.addParam('assigned_to_id', assigned_to_id);
      if (project_id !== undefined) qb.addParam('project_id', project_id);
      if (query) qb.addParam('q', query);
      // For simple params, use comma-separated string if array
      const statusIdParam = statusIdArray !== undefined 
        ? statusIdArray.join(',')
        : '*';
      qb.addParam('status_id', statusIdParam);
    }

    if (updated_on !== undefined) {
      const pipe_idx = updated_on.indexOf('|');
      if (pipe_idx !== -1) {
        const op = updated_on.slice(0, 2);
        const parts = updated_on.slice(2).split('|');
        qb.addFilter('updated_on', op as any, parts);
      } else {
        const op = updated_on.slice(0, 2);
        const val = updated_on.slice(2);
        qb.addFilter('updated_on', op as any, [val]);
      }
    }

    qb.addParam('limit', Math.min(limit, 100))
      .addParam('offset', offset)
      .addParam('sort', sort);
    
    const qs = qb.buildQueryString();

    if (paginate) {
      const paginateParams = qb.buildParams();
      const all_issues = await this.paginate_all_results('/issues.json', 
        { ...paginateParams, limit: undefined, offset: undefined }, 
        'issues'
      );
      const result = {
        issues: all_issues,
        total: all_issues.length,
        limit: all_issues.length,
        offset: 0,
      };
      if (save_to_file) {
        const filepath = await this.save_result_to_file(result);
        return { issues: null, total: result.total, limit: result.limit, offset: result.offset, file_path: filepath } as any;
      }
      return result;
    }

    const data = await this.request('GET', `/issues.json${qs}`);

    const result = {
      issues: data.issues || [],
      total: data.total_count || 0,
      limit: data.limit || limit,
      offset: data.offset || offset,
    };

    if (save_to_file) {
      const filepath = await this.save_result_to_file(result);
      return { issues: null, total: result.total, limit: result.limit, offset: result.offset, file_path: filepath } as any;
    }

    return result;
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
    parent_id?: number;
    paginate?: boolean;
    save_to_file?: boolean;
  } = {}): Promise<ProjectsResponse> {
    const { limit = 25, offset = 0, search, parent_id, paginate = false, save_to_file = false } = options;

    // Validate pagination parameters
    validator.validateLimit(limit);
    validator.validateOffset(offset);

    // If paginate is true, fetch all projects
    if (paginate) {
      const base_params = parent_id !== undefined ? { parent_id } : {};
      const all_projects = await this.paginate_all_results('/projects.json', base_params, 'projects');

      // Filter by search if provided
      let filtered_projects = all_projects;
      if (search) {
        const search_lower = search.toLowerCase();
        filtered_projects = all_projects.filter((p: any) => {
          const name = (p.name || '').toLowerCase();
          const identifier = (p.identifier || '').toLowerCase();
          const description = (p.description || '').toLowerCase();
          return (
            name.includes(search_lower) ||
            identifier.includes(search_lower) ||
            description.includes(search_lower)
          );
        });
      }

      const result = {
        projects: filtered_projects,
        total: filtered_projects.length,
        limit: filtered_projects.length,
        offset: 0,
      };

      if (save_to_file) {
        const filepath = await this.save_result_to_file(result);
        return { projects: null, total: result.total, limit: result.limit, offset: result.offset, file_path: filepath } as any;
      }
      return result;
    }

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
          ...(parent_id !== undefined ? { parent_id } : {}),
        };

        const qs = this.buildQueryStringFromParams(params);
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

      const result = {
        projects: paginatedProjects,
        total: allProjects.length,
        limit: Math.min(limit, paginatedProjects.length),
        offset,
      };

      if (save_to_file) {
        const filepath = await this.save_result_to_file(result);
        return { projects: null, total: result.total, limit: result.limit, offset: result.offset, file_path: filepath } as any;
      }

      return result;
    }

    // Regular pagination without search
    const params = {
      limit: Math.min(limit, 100),
      offset,
      ...(parent_id !== undefined ? { parent_id } : {}),
    };

    const qs = this.buildQueryStringFromParams(params);
    const data = await this.request('GET', `/projects.json${qs}`);

    const result = {
      projects: data.projects || [],
      total: data.total_count || 0,
      limit: data.limit || limit,
      offset: data.offset || offset,
    };

    if (save_to_file) {
      const filepath = await this.save_result_to_file(result);
      return { projects: null, total: result.total, limit: result.limit, offset: result.offset, file_path: filepath } as any;
    }

    return result;
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
    project_ids?: number[];
    issue_id?: number;
    from_date?: string;
    to_date?: string;
    period?: string;
    limit?: number;
    offset?: number;
    paginate?: boolean;
    save_to_file?: boolean;
  } = {}): Promise<TimeEntriesResponse> {
    const {
      user_id,
      project_id,
      project_ids,
      issue_id,
      from_date,
      to_date,
      period,
      limit = 25,
      offset = 0,
      paginate = false,
      save_to_file = false,
    } = options;

    // Validate parameters
    if (user_id !== undefined) {
      validator.validateUserId(user_id, 'user_id');
    }
    if (project_id !== undefined) {
      validator.validateProjectId(project_id);
    }
    if (project_ids !== undefined) {
      project_ids.forEach(pid => validator.validateProjectId(pid));
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

    // Always use QueryBuilder
    const qb = new QueryBuilder();
    
    if (user_id !== undefined) qb.addParam('user_id', user_id);
    if (project_id !== undefined) qb.addParam('project_id', project_id);
    if (issue_id !== undefined) qb.addParam('issue_id', issue_id);
    
    if (project_ids && project_ids.length > 0) {
      qb.addFilter('project_id', '=', project_ids);
    }

    if (period) {
      qb.addFilter('spent_on', period);
    } else if (from_date || to_date) {
      qb.addFilter('spent_on', '><', [from_date || '', to_date || '']);
    }

    qb.addParam('limit', Math.min(limit, 100))
      .addParam('offset', offset);
    
    const qs = qb.buildQueryString();

    if (paginate) {
      const paginateParams = qb.buildParams();
      const all_entries = await this.paginate_all_results('/time_entries.json', 
        { ...paginateParams, limit: undefined, offset: undefined }, 
        'time_entries'
      );
      const result = {
        time_entries: all_entries,
        total: all_entries.length,
        limit: all_entries.length,
        offset: 0,
      };
      if (save_to_file) {
        const filepath = await this.save_result_to_file(result);
        return { time_entries: null, total: result.total, limit: result.limit, offset: result.offset, file_path: filepath } as any;
      }
      return result;
    }

    const data = await this.request('GET', `/time_entries.json${qs}`);

    const result = {
      time_entries: data.time_entries || [],
      total: data.total_count || 0,
      limit: data.limit || limit,
      offset: data.offset || offset,
    };

    if (save_to_file) {
      const filepath = await this.save_result_to_file(result);
      return { time_entries: null, total: result.total, limit: result.limit, offset: result.offset, file_path: filepath } as any;
    }

    return result;
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
