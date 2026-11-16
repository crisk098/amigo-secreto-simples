import { promises as fs } from 'node:fs';
import path from 'node:path';

export const createEmptyDb = () => ({
  version: 2,
  config: {
    eventName: 'Amigo Secreto',
    suggestedBudget: '',
    eventDate: '',
    eventLocation: '',
    publicBaseUrl: '',
    organizerPasswordHash: ''
  },
  participants: [],
  draw: null
});

/**
 * Persistência em arquivo JSON com:
 *  - escrita atômica (arquivo temporário + rename);
 *  - mutações serializadas (sem condições de corrida);
 *  - rollback automático: se o mutator falhar, o estado anterior é mantido.
 */
export class Store {
  #db = createEmptyDb();
  #queue = Promise.resolve();

  constructor(file) {
    this.file = file;
  }

  get state() {
    return this.#db;
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = await fs.readFile(this.file, 'utf-8');
      const parsed = JSON.parse(raw);
      const base = createEmptyDb();
      this.#db = {
        ...base,
        ...parsed,
        config: { ...base.config, ...parsed.config },
        participants: Array.isArray(parsed.participants) ? parsed.participants : []
      };
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`Não foi possível ler ${this.file}: ${err.message}`);
      await this.#persist();
    }
  }

  /** Aplica a mutação sobre uma cópia e só confirma se tudo der certo. */
  update(mutator) {
    const run = async () => {
      const draft = structuredClone(this.#db);
      const result = await mutator(draft);
      await this.#persist(draft);
      this.#db = draft;
      return result;
    };
    const task = this.#queue.then(run, run);
    this.#queue = task.catch(() => {});
    return task;
  }

  async #persist(db = this.#db) {
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf-8');
    await fs.rename(tmp, this.file);
  }
}
