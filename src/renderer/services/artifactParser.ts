import type { Artifact, ArtifactType } from '../types/artifact';
import type { CoworkMessage } from '../types/cowork';

/**
 * Normalize file path for deduplication comparison.
 * Handles Windows file:// URL leading slash and backslash differences.
 */
export function normalizeFilePathForDedup(p: string): string {
  let normalized = p.trim();
  if (normalized.startsWith('file:///')) {
    normalized = normalized.slice(7);
  } else if (normalized.startsWith('file://')) {
    normalized = normalized.slice(7);
  } else if (normalized.startsWith('file:/')) {
    normalized = normalized.slice(5);
  }
  const queryIndex = normalized.search(/[?#]/);
  if (queryIndex >= 0) {
    normalized = normalized.slice(0, queryIndex);
  }
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the original value if it contains a literal percent sign.
  }
  // Strip leading / before drive letter (e.g. /D:/path from file:///D:/path)
  if (/^\/[A-Za-z]:/.test(normalized)) normalized = normalized.slice(1);
  // Unify separators and case for comparison
  return normalized.replace(/\\/g, '/').toLowerCase();
}

const getArtifactIdentityKeys = (artifact: Artifact): string[] => {
  const keys: string[] = [];
  if (artifact.filePath) {
    keys.push(`file:${artifact.type}:${normalizeFilePathForDedup(artifact.filePath)}`);
  }
  const remoteUrl = artifact.remoteUrl?.trim();
  if (remoteUrl) {
    keys.push(`url:${artifact.type}:${remoteUrl}`);
  }
  if ((artifact.type === 'image' || artifact.type === 'video') && artifact.content?.trim()) {
    keys.push(`url:${artifact.type}:${artifact.content.trim()}`);
  }
  const fileName = artifact.fileName?.trim() || artifact.title?.trim();
  if (artifact.type === 'video' && fileName) {
    keys.push(`name:${artifact.type}:${fileName.toLowerCase()}`);
  }
  return keys;
};

const shouldPreferArtifact = (candidate: Artifact, current: Artifact): boolean => {
  const currentHasFileProtocol = Boolean(current.filePath && /^file:/i.test(current.filePath));
  const candidateHasFileProtocol = Boolean(candidate.filePath && /^file:/i.test(candidate.filePath));
  if (current.filePath && !candidate.filePath) return false;
  if (!current.filePath && candidate.filePath) return true;
  if (currentHasFileProtocol && candidate.filePath && !candidateHasFileProtocol) return true;
  if (!currentHasFileProtocol && current.filePath && candidateHasFileProtocol) return false;
  if (!current.remoteUrl && candidate.remoteUrl) return true;
  if (!current.content && candidate.content) return true;
  return false;
};

export function dedupeArtifactsForDisplay(artifacts: Artifact[]): Artifact[] {
  const result: Artifact[] = [];
  const keyToIndex = new Map<string, number>();

  for (const artifact of artifacts) {
    const keys = getArtifactIdentityKeys(artifact);
    const existingIndex = keys
      .map(key => keyToIndex.get(key))
      .find((index): index is number => index !== undefined);

    if (existingIndex === undefined) {
      const nextIndex = result.length;
      result.push(artifact);
      for (const key of keys) {
        keyToIndex.set(key, nextIndex);
      }
      continue;
    }

    if (shouldPreferArtifact(artifact, result[existingIndex])) {
      result[existingIndex] = artifact;
    }
    for (const key of keys) {
      keyToIndex.set(key, existingIndex);
    }
  }

  return result;
}

export function hasToolResultMediaAssets(toolResultMsg: CoworkMessage | undefined): boolean {
  if (!toolResultMsg?.metadata || toolResultMsg.metadata.isError) return false;

  const details = toolResultMsg.metadata.toolResultDetails;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false;

  const assets = (details as Record<string, unknown>).assets;
  if (!Array.isArray(assets)) return false;

  return assets.some(asset => {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return false;
    const item = asset as Record<string, unknown>;
    if (item.type !== 'image' && item.type !== 'video') return false;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const filePath = typeof item.filePath === 'string' ? item.filePath.trim() : '';
    const localPath = typeof item.localPath === 'string' ? item.localPath.trim() : '';
    if (item.type === 'video') {
      return Boolean(filePath || localPath);
    }
    return Boolean(url || filePath || localPath);
  });
}

const EXTENSION_TO_ARTIFACT_TYPE: Record<string, ArtifactType> = {
  '.html': 'html',
  '.htm': 'html',
  '.svg': 'svg',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.avif': 'image',
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.mermaid': 'mermaid',
  '.mmd': 'mermaid',
  '.jsx': 'code',
  '.tsx': 'code',
  '.css': 'code',
  '.md': 'markdown',
  '.txt': 'text',
  '.log': 'text',
  '.csv': 'document',
  '.tsv': 'document',
  '.xls': 'document',
  '.docx': 'document',
  '.xlsx': 'document',
  '.pptx': 'document',
  '.pdf': 'document',
};

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);
const BINARY_DOCUMENT_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx', '.pdf', '.csv', '.tsv', '.xls']);


export function getArtifactTypeFromExtension(ext: string): ArtifactType | null {
  return EXTENSION_TO_ARTIFACT_TYPE[ext.toLowerCase()] ?? null;
}

export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase());
}

export function isVideoExtension(ext: string): boolean {
  return VIDEO_EXTENSIONS.has(ext.toLowerCase());
}

export function isBinaryDocumentExtension(ext: string): boolean {
  return BINARY_DOCUMENT_EXTENSIONS.has(ext.toLowerCase());
}

export const MEDIA_TOKEN_RE = /\bMEDIA:\s*`?([^`\n]+?)`?\s*$/gim;

export function parseMediaTokensFromText(
  messageContent: string,
  messageId: string,
  sessionId: string,
): Artifact[] {
  if (!messageContent) return [];

  const artifacts: Artifact[] = [];
  const re = new RegExp(MEDIA_TOKEN_RE.source, 'gim');
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = re.exec(messageContent)) !== null) {
    let filePath = match[1].trim();
    if (!filePath) continue;

    if (filePath.startsWith('file:///')) {
      filePath = filePath.slice(7);
    } else if (filePath.startsWith('file://')) {
      filePath = filePath.slice(7);
    }

    // Strip leading / before Windows drive letter (e.g. /D:/path from file:///D:/path)
    if (/^\/[A-Za-z]:/.test(filePath)) {
      filePath = filePath.slice(1);
    }

    const ext = getFileExtension(filePath);
    const artifactType = getArtifactTypeFromExtension(ext);
    if (!artifactType) continue;

    const fileName = getFileName(filePath);

    artifacts.push({
      id: `artifact-media-${messageId}-${index}`,
      messageId,
      sessionId,
      type: artifactType,
      title: fileName,
      content: '',
      fileName,
      filePath,
      createdAt: Date.now(),
    });

    index++;
  }

  return artifacts;
}

const FILE_LINK_RE = /\[([^\]]+)\]\(file:\/\/([^)]+)\)/g;
const REMOTE_MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
const REMOTE_IMAGE_URL_RE = /(?:^|[\s<("'`])(https?:\/\/[^\s<>"'`)]*\.(?:png|jpe?g|gif|webp|bmp|avif)(?:\?[^\s<>"'`)]*)?)(?:[\s>)"'`]|$)/gi;

export function stripFileLinksFromText(text: string): string {
  return text.replace(/\[([^\]]+)\]\(file:\/\/([^)]+)\)/g, '');
}

const BARE_FILE_PATH_RE = /(?:^|[\s"'`(])(\/?(?:[^\s"'`()\[\]]+\/)+[^\s"'`()\[\]]+\.(?:png|jpe?g|gif|webp|bmp|avif|mp4|webm|mov|docx|xlsx|pptx|pdf|md|txt|log|csv))(?:[\s"'`)]|$)/gm;

export function parseFilePathsFromText(
  messageContent: string,
  messageId: string,
  sessionId: string,
  idPrefix = 'artifact-path',
): Artifact[] {
  if (!messageContent) return [];

  const artifacts: Artifact[] = [];
  const re = new RegExp(BARE_FILE_PATH_RE.source, 'gm');
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = re.exec(messageContent)) !== null) {
    let filePath = match[1];

    if (filePath.startsWith('file:///')) {
      filePath = filePath.slice(7);
    } else if (filePath.startsWith('file://')) {
      filePath = filePath.slice(7);
    } else if (filePath.startsWith('file:/')) {
      filePath = filePath.slice(5);
    }

    // Strip leading / before Windows drive letter (e.g. /D:/path from file:///D:/path)
    if (/^\/[A-Za-z]:/.test(filePath)) {
      filePath = filePath.slice(1);
    }

    const ext = getFileExtension(filePath);
    const artifactType = getArtifactTypeFromExtension(ext);
    if (!artifactType) continue;

    const fileName = getFileName(filePath);

    artifacts.push({
      id: `${idPrefix}-${messageId}-${index}`,
      messageId,
      sessionId,
      type: artifactType,
      title: fileName,
      content: '',
      fileName,
      filePath,
      createdAt: Date.now(),
    });

    index++;
  }

  return artifacts;
}

export function parseFileLinksFromMessage(
  messageContent: string,
  messageId: string,
  sessionId: string,
): Artifact[] {
  if (!messageContent) return [];

  const artifacts: Artifact[] = [];
  const re = new RegExp(FILE_LINK_RE.source, 'g');
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = re.exec(messageContent)) !== null) {
    const linkText = match[1];
    let filePath: string;
    try {
      filePath = decodeURIComponent(match[2]);
    } catch {
      filePath = match[2];
    }
    // Strip leading / before Windows drive letter (e.g. /D:/path from file:///D:/path)
    if (/^\/[A-Za-z]:/.test(filePath)) {
      filePath = filePath.slice(1);
    }
    const ext = getFileExtension(filePath);
    const artifactType = getArtifactTypeFromExtension(ext);
    if (!artifactType) continue;

    const fileName = getFileName(filePath);

    artifacts.push({
      id: `artifact-link-${messageId}-${index}`,
      messageId,
      sessionId,
      type: artifactType,
      title: linkText || fileName,
      content: '',
      fileName,
      filePath,
      createdAt: Date.now(),
    });

    index++;
  }

  return artifacts;
}

export function parseRemoteImageArtifactsFromText(
  messageContent: string,
  messageId: string,
  sessionId: string,
  idPrefix = 'artifact-remote-image',
): Artifact[] {
  if (!messageContent) return [];

  const artifacts: Artifact[] = [];
  const seen = new Set<string>();
  let index = 0;

  const pushImage = (url: string, title?: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || seen.has(trimmedUrl)) return;
    seen.add(trimmedUrl);
    artifacts.push({
      id: `${idPrefix}-${messageId}-${index++}`,
      messageId,
      sessionId,
      type: 'image',
      title: title?.trim() || `Generated image ${index}`,
      content: trimmedUrl,
      fileName: title?.trim() || `generated-image-${index}`,
      source: 'tool',
      createdAt: Date.now(),
    });
  };

  const markdownRe = new RegExp(REMOTE_MARKDOWN_IMAGE_RE.source, 'g');
  let markdownMatch: RegExpExecArray | null;
  while ((markdownMatch = markdownRe.exec(messageContent)) !== null) {
    pushImage(markdownMatch[2], markdownMatch[1]);
  }

  const bareUrlRe = new RegExp(REMOTE_IMAGE_URL_RE.source, 'gi');
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = bareUrlRe.exec(messageContent)) !== null) {
    pushImage(urlMatch[1]);
  }

  return artifacts;
}

export function parseToolResultMediaArtifacts(
  toolResultMsg: CoworkMessage | undefined,
  sessionId: string,
): Artifact[] {
  if (!toolResultMsg?.metadata || toolResultMsg.metadata.isError) return [];

  const details = toolResultMsg.metadata.toolResultDetails;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [];

  const assets = (details as Record<string, unknown>).assets;
  if (!Array.isArray(assets)) return [];

  const artifacts: Artifact[] = [];
  for (let index = 0; index < assets.length; index++) {
    const asset = assets[index];
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) continue;
    const item = asset as Record<string, unknown>;
    if (item.type !== 'image' && item.type !== 'video') continue;
    const artifactType: ArtifactType = item.type === 'video' ? 'video' : 'image';

    const url = typeof item.url === 'string' && item.url.trim()
      ? item.url.trim()
      : '';
    const filePath = typeof item.filePath === 'string' && item.filePath.trim()
      ? item.filePath.trim()
      : typeof item.localPath === 'string' && item.localPath.trim()
        ? item.localPath.trim()
        : '';
    if (artifactType === 'video' && !filePath) continue;
    if (!url && !filePath) continue;

    const filename = typeof item.filename === 'string' && item.filename.trim()
      ? item.filename.trim()
      : filePath
        ? getFileName(filePath)
        : `generated-${artifactType}-${index + 1}`;

    artifacts.push({
      id: `artifact-media-${toolResultMsg.id}-${index}`,
      messageId: toolResultMsg.id,
      sessionId,
      type: artifactType,
      title: filename,
      content: filePath ? '' : url,
      fileName: filename,
      ...(filePath ? { filePath } : {}),
      ...(filePath && url ? { remoteUrl: url } : {}),
      source: 'tool',
      createdAt: toolResultMsg.timestamp || Date.now(),
    });
  }

  return artifacts;
}

const WRITE_TOOL_NAMES = new Set(['write', 'writefile', 'write_file']);

function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[_\s]/g, '');
}

function extractFilePath(toolInput: Record<string, unknown>): string | null {
  for (const key of ['file_path', 'path', 'filePath', 'target_file', 'targetFile']) {
    const val = toolInput[key];
    if (typeof val === 'string' && val.length > 0) {
      return val;
    }
  }
  return null;
}

function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filePath.slice(lastDot).toLowerCase();
}

function getFileName(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
}

export function parseToolArtifact(
  toolUseMsg: CoworkMessage,
  toolResultMsg: CoworkMessage | undefined,
  sessionId: string,
): Artifact | null {
  const toolName = toolUseMsg.metadata?.toolName;
  if (!toolName || !WRITE_TOOL_NAMES.has(normalizeToolName(toolName))) {
    return null;
  }

  if (toolResultMsg?.metadata?.isError) {
    return null;
  }

  const toolInput = toolUseMsg.metadata?.toolInput as Record<string, unknown> | undefined;
  if (!toolInput) return null;

  const filePath = extractFilePath(toolInput);
  if (!filePath) return null;

  const ext = getFileExtension(filePath);
  const artifactType = getArtifactTypeFromExtension(ext);
  if (!artifactType) return null;

  const fileName = getFileName(filePath);
  const isImage = isImageExtension(ext);
  const isVideo = isVideoExtension(ext);
  const isBinaryDoc = isBinaryDocumentExtension(ext);
  const content = (isImage || isVideo || isBinaryDoc) ? '' : (typeof toolInput.content === 'string' ? toolInput.content : '');

  return {
    id: `artifact-tool-${toolUseMsg.id}`,
    messageId: toolUseMsg.id,
    sessionId,
    type: artifactType,
    title: fileName,
    content,
    fileName,
    filePath,
    createdAt: toolUseMsg.timestamp || Date.now(),
  };
}
