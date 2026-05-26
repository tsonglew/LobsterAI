import path from 'path';

import type { SkillManager } from '../skillManager';

/** Narrow type for the OpenClaw skills.status report used by IPC handlers */
export interface OpenClawSkillReport {
  skills: Array<{
    source?: string;
    skillKey?: string;
    baseDir?: string;
  }>;
}

/**
 * Extract plugin-provided skill IDs from an OpenClaw status report
 * and update the SkillManager's cached set.
 */
export function updatePluginSkillIdsFromReport(
  sm: SkillManager,
  report: OpenClawSkillReport,
): void {
  const pluginIds = new Set<string>();
  for (const entry of report.skills ?? []) {
    if (entry.source === 'openclaw-extra') {
      const id = entry.skillKey || (entry.baseDir ? path.basename(entry.baseDir) : '');
      if (id) pluginIds.add(id);
    }
  }
  sm.setPluginSkillIds(pluginIds);
}
