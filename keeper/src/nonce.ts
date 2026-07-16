/**
 * Serialized nonce queue: all sends flow through one promise chain so the
 * keeper never races itself on nonces even when several orders fire together.
 */
export class NonceQueue {
  private chain: Promise<unknown> = Promise.resolve();

  enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.chain.then(job, job);
    // Keep the chain alive regardless of individual job failures.
    this.chain = next.catch(() => {});
    return next;
  }
}
