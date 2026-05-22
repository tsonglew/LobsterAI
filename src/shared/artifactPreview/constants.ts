export const ArtifactPreviewIpc = {
  CreateSession: 'artifact:createPreviewSession',
  CreateOfficeSession: 'artifact:createOfficePreviewSession',
  DestroySession: 'artifact:destroyPreviewSession',
} as const;

export type ArtifactPreviewIpc = typeof ArtifactPreviewIpc[keyof typeof ArtifactPreviewIpc];

export const ArtifactPreviewProtocol = {
  LocalFile: 'localfile',
} as const;

export type ArtifactPreviewProtocol = typeof ArtifactPreviewProtocol[keyof typeof ArtifactPreviewProtocol];
