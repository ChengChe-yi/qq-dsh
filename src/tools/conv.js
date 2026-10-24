

const DIR_RE = /^(group|private)_(\d+)$/;

export function convKeyOf(cwd) {
  const base = String(cwd ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';
  const m = DIR_RE.exec(base);
  return m ? `${m[1]}:${m[2]}` : '';
}

export function convOf(exec) {
  const agent = exec?.agent;
  const cwd = String(agent?.session?.header?.cwd ?? '');
  return { key: convKeyOf(cwd), cwd, sessionId: String(agent?.id ?? '') };
}
