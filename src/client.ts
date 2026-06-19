/* Thin async client for the Redmine REST API (issues + time_entries plugin). */

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
        throw new RedmineAPIError(
          `Redmine API error on ${method} ${path}: ${response.status}`,
          response.status,
          text
        );
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
    assigned_to_id?: number;
    notes?: string;
    done_ratio?: number;
  }): Promise<void> {
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
  } = {}): Promise<ProjectsResponse> {
    const { limit = 25, offset = 0 } = options;

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
