import 'server-only';
import type { JobState } from '@/lib/types';

// 生成処理はリクエストと切り離してサーバー側で走らせる。
// スマホの画面が消えて通信が切れても生成は続き、戻ってきたときに結果を取りに来られる。
// 状態はこのプロセスのメモリに持つ（結果は DB に保存する）。

export type TextJob = {
  generationId: string;
  episodeId: string;
  content: string;
  /** 推論中で、本文がまだ届いていない */
  thinking: boolean;
  abort: AbortController;
  startedAt: number;
};

export type TaskKind = 'summary' | 'image';

export type TaskJob = {
  kind: TaskKind;
  episodeId: string;
  status: 'running' | 'error';
  error: string | null;
  abort: AbortController;
  startedAt: number;
};

type Registry = {
  generations: Map<string, TextJob>;
  tasks: Map<string, TaskJob>;
};

const g = globalThis as unknown as { __novelJobs?: Registry };
const registry: Registry = (g.__novelJobs ??= { generations: new Map(), tasks: new Map() });

export const generationJobs = registry.generations;

export function runningGenerationFor(episodeId: string): TextJob | undefined {
  for (const job of registry.generations.values()) if (job.episodeId === episodeId) return job;
  return undefined;
}

const taskKey = (kind: TaskKind, episodeId: string) => `${kind}:${episodeId}`;

/** エラーの表示は30分で消す */
const ERROR_TTL_MS = 30 * 60 * 1000;

export function getTask(kind: TaskKind, episodeId: string): TaskJob | undefined {
  const key = taskKey(kind, episodeId);
  const job = registry.tasks.get(key);
  if (job?.status === 'error' && Date.now() - job.startedAt > ERROR_TTL_MS) {
    registry.tasks.delete(key);
    return undefined;
  }
  return job;
}

export function taskState(kind: TaskKind, episodeId: string): JobState | null {
  const job = getTask(kind, episodeId);
  return job ? { status: job.status, error: job.error, startedAt: job.startedAt } : null;
}

/** タスクを登録して走らせる。成功したら登録を消し、失敗したらエラーを残す */
export function runTask(
  kind: TaskKind,
  episodeId: string,
  work: (signal: AbortSignal) => Promise<void>,
  describe: (err: unknown) => string,
): TaskJob {
  const key = taskKey(kind, episodeId);
  const job: TaskJob = {
    kind,
    episodeId,
    status: 'running',
    error: null,
    abort: new AbortController(),
    startedAt: Date.now(),
  };
  registry.tasks.set(key, job);
  void (async () => {
    try {
      await work(job.abort.signal);
      if (registry.tasks.get(key) === job) registry.tasks.delete(key);
    } catch (err) {
      console.error(`[job:${kind}]`, err);
      job.status = 'error';
      job.error = describe(err);
    }
  })();
  return job;
}

export function clearTaskError(kind: TaskKind, episodeId: string): void {
  const key = taskKey(kind, episodeId);
  if (registry.tasks.get(key)?.status === 'error') registry.tasks.delete(key);
}
