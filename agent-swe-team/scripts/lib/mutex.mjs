// Mutex — simple async lock for serializing concurrent operations
// Prevents lost-update race conditions in Board and MeetingRoom.
//
// Usage:
//   const lock = new Mutex();
//   await lock.run(async () => { /* critical section */ });

export class Mutex {
    #queue = [];
    #locked = false;

    async run(fn) {
        await this.#acquire();
        try {
            return await fn();
        } finally {
            this.#release();
        }
    }

    #acquire() {
        return new Promise((resolve) => {
            if (!this.#locked) {
                this.#locked = true;
                resolve();
            } else {
                this.#queue.push(resolve);
            }
        });
    }

    #release() {
        if (this.#queue.length > 0) {
            const next = this.#queue.shift();
            next();
        } else {
            this.#locked = false;
        }
    }
}
