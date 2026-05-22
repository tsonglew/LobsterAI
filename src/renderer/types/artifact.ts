export type ArtifactType = 'html' | 'svg' | 'image' | 'video' | 'mermaid' | 'code' | 'markdown' | 'text' | 'document';
export type ArtifactSource = 'inline' | 'tool' | 'file';

export const PREVIEWABLE_ARTIFACT_TYPES = new Set<ArtifactType>(['html', 'svg', 'mermaid', 'image', 'video', 'markdown', 'text', 'document']);

export interface Artifact {
  id: string;
  messageId: string;
  sessionId: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
  fileName?: string;
  filePath?: string;
  remoteUrl?: string;
  source?: ArtifactSource;
  createdAt: number;
}

export interface ArtifactMarker {
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
  fullMatch: string;
}
