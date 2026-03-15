export interface ParityWarmupQueue {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createParityWarmupQueue(input: { maxParallel: number }): ParityWarmupQueue {
  const maxParallel = Math.max(1, Math.floor(input.maxParallel || 1));
  let running = 0;
  const pending: Array<() => void> = [];

  const drain = (): void => {
    while (running < maxParallel && pending.length > 0) {
      const job = pending.shift();
      if (!job) return;
      running += 1;
      job();
    }
  };

  const run = <T>(task: () => Promise<T>): Promise<T> => (
    new Promise<T>((resolve, reject) => {
      const exec = () => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            running = Math.max(0, running - 1);
            drain();
          });
      };
      pending.push(exec);
      drain();
    })
  );

  return { run };
}
