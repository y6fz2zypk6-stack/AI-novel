// クライアントとサーバーの両方から使う型（実行時のコードを持たない）

export type ProviderType = 'openrouter' | 'openai-compatible';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type GenerationSettings = {
  temperature: number;
  /** null なら Provider に送らない（モデルの既定に任せる） */
  maxTokens: number | null;
};

export type Usage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** OpenRouter が返す場合のみ（USD） */
  cost?: number;
};

export type PromptSnapshot = {
  version: 1;
  provider: { id: string; name: string; type: ProviderType; baseUrl: string };
  model: string;
  systemInstruction: string;
  worldInstruction: string;
  characters: { id: string; name: string; content: string }[];
  lore: { id: string; title: string; content: string }[];
  previousSummary: string;
  episodeNumber: number;
  episodeTitle: string;
  episodeInstruction: string;
  outputInstruction: string;
  revision: { baseGenerationId: string; baseContent: string; note: string } | null;
  generationSettings: GenerationSettings;
  /** 実際に送ったメッセージ */
  messages: ChatMessage[];
};

export type GenerationStatus = 'generating' | 'done' | 'error' | 'stopped';

/** 候補一覧・ページャーで使う Generation（Snapshot を含まない） */
export type GenerationView = {
  id: string;
  provider: string;
  model: string;
  content: string;
  status: GenerationStatus;
  error: string | null;
  finishReason: string | null;
  usage: Usage | null;
  settings: GenerationSettings;
  revisionOf: string | null;
  revisionNote: string | null;
  createdAt: number;
  finishedAt: number | null;
};

/** 生成中の Generation をポーリングしたときの応答 */
export type GenerationPoll = {
  id: string;
  status: GenerationStatus;
  /** from 以降の本文 */
  delta: string;
  /** 本文の全長（次回の from に使う） */
  length: number;
  /** 推論中（本文はまだ届いていない） */
  thinking: boolean;
  error: string | null;
  finishReason: string | null;
  usage: Usage | null;
  finishedAt: number | null;
};

export type ImageView = {
  id: string;
  episodeId: string;
  generationId: string | null;
  provider: string;
  model: string;
  prompt: string;
  instruction: string;
  createdAt: number;
  url: string;
  thumbUrl: string;
};

export type JobState = {
  status: 'running' | 'error';
  error: string | null;
  startedAt: number;
};

export type ProviderView = {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  /** 例: sk-or-••••••••3f2a。キー未設定なら null */
  maskedKey: string | null;
  keySource: 'db' | 'env' | null;
  defaultTextModel: string;
  defaultSummaryModel: string;
  defaultImageModel: string;
};

export type ModelPurpose = 'writing' | 'summary' | 'image';

export type AppSettings = {
  writingProviderId: string | null;
  summaryProviderId: string | null;
  imageProviderId: string | null;
  temperature: number;
  maxTokens: number | null;
};

export type ModelInfo = {
  id: string;
  name: string;
  contextLength: number | null;
};

/** 画面に出す「どのモデルで書くか」 */
export type ModelChoice = {
  providerId: string;
  providerName: string;
  model: string;
};

/** 次話用要約の状態（GET /api/episodes/:id/summary） */
export type SummaryState = {
  summary: string;
  draft: string | null;
  draftSource: 'ai' | 'edit' | null;
  summaryGenerationId: string | null;
  acceptedGenerationId: string | null;
  job: JobState | null;
};
