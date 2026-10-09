// 話の呼び方（クライアントとサーバーの両方から使う）
import type { EpisodeKind } from './types';

/** 見出し用。例: Episode 12 / 番外編 2 */
export function episodeTitle(kind: EpisodeKind, n: number): string {
  return kind === 'side' ? `番外編 ${n}` : `Episode ${n}`;
}

/** 一覧やメタ情報用の短い呼び方。例: Ep.12 / 番外編2 */
export function episodeShort(kind: EpisodeKind, n: number): string {
  return kind === 'side' ? `番外編${n}` : `Ep.${n}`;
}

/** プロンプト用。例: 第12話 / 番外編2 */
export function episodeOrdinal(kind: EpisodeKind, n: number): string {
  return kind === 'side' ? `番外編${n}` : `第${n}話`;
}
