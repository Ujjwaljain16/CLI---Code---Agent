/**
 * Lightweight in-memory session store.
 * Persists conversation history and agent state.
 */
export class SessionMemory {
  constructor(maxTurns = 20) {
    this.maxTurns = maxTurns;
    this.history = [];
    this.generatedFiles = [];
    this.taskLog = []; // Track what was accomplished
  }

  addUserMessage(content) {
    this.history.push({
      role: 'user',
      content: content,
      timestamp: Date.now(),
    });
    this._trimHistory();
  }

  addAssistantMessage(content) {
    this.history.push({
      role: 'assistant',
      content: content,
      timestamp: Date.now(),
    });
    this._trimHistory();
  }

  addObserve(content) {
    this.history.push({
      role: 'observe',
      content: content,
      timestamp: Date.now(),
    });
    this._trimHistory();
  }

  trackGeneratedFile(filePath, content) {
    this.generatedFiles.push({
      path: filePath,
      content,
      timestamp: Date.now(),
    });
  }

  logTask(task, status = 'completed', details = {}) {
    this.taskLog.push({
      task,
      status,
      details,
      timestamp: Date.now(),
    });
  }

  getGeneratedFile(filePath) {
    return this.generatedFiles.find((f) => f.path === filePath);
  }

  getAllGeneratedFiles() {
    return this.generatedFiles;
  }

  getHistory() {
    return this.history;
  }

  getFormattedHistory() {
    return this.history
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(msg.content ?? '') }],
      }))
      .slice(-this.maxTurns);
  }

  getTaskSummary() {
    if (this.taskLog.length === 0) {
      return 'No tasks logged yet.';
    }

    return this.taskLog
      .map((t, i) => `${i + 1}. ${t.task} — ${t.status}`)
      .join('\n');
  }

  _trimHistory() {
    if (this.history.length > this.maxTurns * 2) {
      this.history = this.history.slice(-this.maxTurns);
    }
  }

  clear() {
    this.history = [];
    this.generatedFiles = [];
    this.taskLog = [];
  }
}
