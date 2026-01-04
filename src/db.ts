import { MonitorState, CheckHistory } from './types';

export class Database {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async getMonitorState(monitorId: string): Promise<MonitorState | null> {
    return await this.db
      .prepare('SELECT * FROM monitors_state WHERE monitor_id = ?')
      .bind(monitorId)
      .first<MonitorState>();
  }

  async upsertMonitorState(state: MonitorState): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO monitors_state (monitor_id, status, last_checked_at, last_latency, fail_count, first_fail_time, last_error)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(monitor_id) DO UPDATE SET
         status = excluded.status,
         last_checked_at = excluded.last_checked_at,
         last_latency = excluded.last_latency,
         fail_count = excluded.fail_count,
         first_fail_time = excluded.first_fail_time,
         last_error = excluded.last_error`
      )
      .bind(
        state.monitor_id,
        state.status,
        state.last_checked_at,
        state.last_latency,
        state.fail_count,
        state.first_fail_time,
        state.last_error || null
      )
      .run();
  }

  async addCheckHistory(history: CheckHistory): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO check_history (monitor_id, timestamp, status, latency, message) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(
        history.monitor_id,
        history.timestamp,
        history.status,
        history.latency,
        history.message
      )
      .run();
  }

  async getHistory(monitorId: string, limit: number = 50): Promise<CheckHistory[]> {
    const { results } = await this.db
      .prepare(
        'SELECT * FROM check_history WHERE monitor_id = ? ORDER BY timestamp DESC LIMIT ?'
      )
      .bind(monitorId, limit)
      .all<CheckHistory>();
    return results.reverse(); // Return in chronological order
  }

  async getRecentHistory(limit: number = 60): Promise<CheckHistory[]> {
     const { results } = await this.db
      .prepare(
         `SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY monitor_id ORDER BY timestamp DESC) as rn
            FROM check_history
         ) WHERE rn <= ?`
      )
      .bind(limit)
      .all<CheckHistory>();
    return results.sort((a, b) => a.timestamp - b.timestamp);
  }

  async getAllMonitorStates(): Promise<MonitorState[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM monitors_state')
      .all<MonitorState>();
    return results;
  }
}
