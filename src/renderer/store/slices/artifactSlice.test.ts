import { expect, test } from 'vitest';

import type { Artifact } from '../../types/artifact';
import type { RootState } from '..';
import artifactReducer, {
  addArtifact,
  openArtifactPreviewTab,
  selectSessionArtifacts,
  setSessionArtifacts,
} from './artifactSlice';

const makeVideoArtifact = (id: string, filePath: string, messageId = 'message-1'): Artifact => ({
  id,
  messageId,
  sessionId: 'session-1',
  type: 'video',
  title: 'generated-video-20260522-171920-1.mp4',
  content: '',
  fileName: 'generated-video-20260522-171920-1.mp4',
  filePath,
  createdAt: 1,
});

test('setSessionArtifacts dedupes generated videos by file path within one message', () => {
  const state = artifactReducer(undefined, setSessionArtifacts({
    sessionId: 'session-1',
    artifacts: [
      makeVideoArtifact('video-file-url', 'file:///Users/admin/work/test0522/generated-video-20260522-171920-1.mp4'),
      makeVideoArtifact('video-local-path', '/Users/admin/work/test0522/generated-video-20260522-171920-1.mp4'),
    ],
  }));

  expect(state.artifactsBySession['session-1']).toHaveLength(1);
  expect(state.artifactsBySession['session-1'][0].id).toBe('video-local-path');
});

test('addArtifact keeps same file path cards from different messages', () => {
  let state = artifactReducer(undefined, addArtifact({
    sessionId: 'session-1',
    artifact: makeVideoArtifact(
      'video-first-reply',
      '/Users/admin/work/test0522/generated-video-20260522-171920-1.mp4',
      'message-first-reply',
    ),
  }));

  state = artifactReducer(state, addArtifact({
    sessionId: 'session-1',
    artifact: makeVideoArtifact(
      'video-second-reply',
      '/Users/admin/work/test0522/generated-video-20260522-171920-1.mp4',
      'message-second-reply',
    ),
  }));

  expect(state.artifactsBySession['session-1']).toHaveLength(2);
});

test('openArtifactPreviewTab resolves duplicate file cards to the display artifact', () => {
  let state = artifactReducer(undefined, addArtifact({
    sessionId: 'session-1',
    artifact: makeVideoArtifact(
      'video-first-reply',
      '/Users/admin/work/test0522/generated-video-20260522-171920-1.mp4',
      'message-first-reply',
    ),
  }));

  state = artifactReducer(state, addArtifact({
    sessionId: 'session-1',
    artifact: {
      ...makeVideoArtifact(
        'video-second-reply',
        '/Users/admin/work/test0522/generated-video-20260522-171920-1.mp4',
        'message-second-reply',
      ),
      createdAt: 2,
    },
  }));

  state = artifactReducer(state, openArtifactPreviewTab({
    sessionId: 'session-1',
    artifactId: 'video-first-reply',
  }));

  expect(state.selectedArtifactId).toBe('video-second-reply');
  expect(state.previewTabsBySession['session-1']).toEqual([
    expect.objectContaining({
      id: 'artifact:video-second-reply',
      artifactId: 'video-second-reply',
    }),
  ]);
});

test('selectSessionArtifacts hides duplicate generated videos from stale state', () => {
  const rootState = {
    artifact: {
      artifactsBySession: {
        'session-1': [
          makeVideoArtifact('video-a', '/Users/admin/work/test0522/generated-video-20260522-171920-1.mp4'),
          makeVideoArtifact('video-b', '/Users/admin/work/test0522/generated-video-20260522-171920-1.mp4'),
        ],
      },
      previewTabsBySession: {},
      activePreviewTabIdBySession: {},
      selectedArtifactId: null,
      isPanelOpen: false,
      panelWidth: 560,
    },
  } as unknown as RootState;

  expect(selectSessionArtifacts(rootState, 'session-1')).toHaveLength(1);
});
