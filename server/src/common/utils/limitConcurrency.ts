/** Thrown when too many jobs are already waiting: the caller should answer "busy, try again". */
export class BusyError extends Error {
  constructor(message = 'The server is busy right now. Try again in a moment.') {
    super(message);
    this.name = 'BusyError';
  }
}

/**
 * A small waiting line for slow work (such as the AI photo check), so a rush of requests on a small server doesn't
 * all run at once: at most `max` run together, up to `maxWaiting` more wait their turn, and anything beyond that
 * gets a BusyError. It lives in this one server process, so it needs no Redis or other service.
 */
export function createLimiter(max: number, maxWaiting: number) {
  let running = 0;
  const waiting: (() => void)[] = [];

  const acquire = async () => {
    if (running < max) {
      running++;
      return;
    }
    if (waiting.length >= maxWaiting) throw new BusyError();
    // The slot is handed over by release(), so `running` stays as it is
    await new Promise<void>((resolve) => waiting.push(resolve));
  };

  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else running--;
  };

  return {
    async run<T>(job: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await job();
      } finally {
        release();
      }
    },
    /** For tests and monitoring */
    stats: () => ({ running, waiting: waiting.length }),
  };
}
