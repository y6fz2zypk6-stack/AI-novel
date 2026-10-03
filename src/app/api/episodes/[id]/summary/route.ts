import { json, notFound, optString, readBody, route } from '@/lib/server/http';
import { taskState } from '@/lib/server/jobs';
import { clearSummaryDraft, getEpisode, saveSummary, saveSummaryDraft } from '@/lib/server/repo/episodes';
import type { SummaryState } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

function state(id: string): SummaryState {
  const ep = getEpisode(id);
  if (!ep) throw notFound('エピソード');
  return {
    summary: ep.summary,
    draft: ep.summaryDraft,
    draftSource: ep.summaryDraftSource,
    summaryGenerationId: ep.summaryGenerationId,
    acceptedGenerationId: ep.acceptedGenerationId,
    job: taskState('summary', id),
  };
}

export const GET = route(async (_req, { params }: Ctx) => json(state((await params).id)));

/** 要約を確定して保存する */
export const PUT = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  state(id);
  const body = await readBody(req);
  saveSummary(id, (optString(body, 'summary') ?? '').trim());
  return json(state(id));
});

/** 編集中の要約（未保存）を残す。draft: null で下書きを破棄 */
export const PATCH = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  state(id);
  const body = await readBody(req);
  if (body.draft === null) clearSummaryDraft(id);
  else saveSummaryDraft(id, optString(body, 'draft') ?? '', 'edit');
  return json(state(id));
});
