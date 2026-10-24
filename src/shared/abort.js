
export function raceAbort(signal, work) {

  const task = Promise.resolve(work);
  if (!signal) return task;

  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new Error('aborted by user'));
  });

  aborted.catch(() => {});

  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });

  task.catch(() => {});
  return Promise.race([task, aborted]).finally(() => {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  });
}
