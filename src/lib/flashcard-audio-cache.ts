export interface FlashcardAudioCacheDependencies {
  resolveAudioUrl: (phraseId: string) => Promise<string | null>;
  fetchAudio: (url: string) => Promise<Blob>;
  createObjectUrl: (audio: Blob) => string;
  revokeObjectUrl: (url: string) => void;
}

const browserDependencies: Pick<FlashcardAudioCacheDependencies, "fetchAudio" | "createObjectUrl" | "revokeObjectUrl"> =
  {
    fetchAudio: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not prefetch audio: HTTP ${response.status}`);
      return response.blob();
    },
    createObjectUrl: (audio) => URL.createObjectURL(audio),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  };

/**
 * Keeps only a small, sliding window of compressed audio files in browser memory.
 * A request in flight is shared by prefetch and an immediate user click.
 */
export class FlashcardAudioCache {
  private readonly entries = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private windowPhraseIds: Set<string> | null = null;
  private disposed = false;

  constructor(private readonly dependencies: FlashcardAudioCacheDependencies) {}

  static forBrowser(resolveAudioUrl: FlashcardAudioCacheDependencies["resolveAudioUrl"]): FlashcardAudioCache {
    return new FlashcardAudioCache({ resolveAudioUrl, ...browserDependencies });
  }

  async get(phraseId: string): Promise<string | null> {
    const cached = this.entries.get(phraseId);
    if (cached) {
      // Refresh the insertion order so this entry is retained when the window moves.
      this.entries.delete(phraseId);
      this.entries.set(phraseId, cached);
      return cached;
    }

    const inFlight = this.pending.get(phraseId);
    if (inFlight) return inFlight;

    const request = this.load(phraseId);
    this.pending.set(phraseId, request);
    try {
      return await request;
    } finally {
      this.pending.delete(phraseId);
    }
  }

  /** Prefetches the supplied sliding window and releases every older audio blob. */
  async prefetchWindow(phraseIds: string[]): Promise<void> {
    const uniquePhraseIds = [...new Set(phraseIds)];
    const keep = new Set(uniquePhraseIds);
    this.windowPhraseIds = keep;

    for (const [phraseId, objectUrl] of this.entries) {
      if (!keep.has(phraseId)) {
        this.entries.delete(phraseId);
        this.dependencies.revokeObjectUrl(objectUrl);
      }
    }

    await Promise.all(uniquePhraseIds.map((phraseId) => this.get(phraseId)));
  }

  dispose(): void {
    this.disposed = true;
    this.windowPhraseIds = new Set();
    for (const objectUrl of this.entries.values()) this.dependencies.revokeObjectUrl(objectUrl);
    this.entries.clear();
    this.pending.clear();
  }

  private async load(phraseId: string): Promise<string | null> {
    try {
      const sourceUrl = await this.dependencies.resolveAudioUrl(phraseId);
      if (!sourceUrl) return null;
      const audio = await this.dependencies.fetchAudio(sourceUrl);
      const objectUrl = this.dependencies.createObjectUrl(audio);
      if (this.disposed || (this.windowPhraseIds && !this.windowPhraseIds.has(phraseId))) {
        this.dependencies.revokeObjectUrl(objectUrl);
        return null;
      }
      this.entries.set(phraseId, objectUrl);
      return objectUrl;
    } catch {
      // Audio is optional. Playback can retry on a later click or window update.
      return null;
    }
  }
}
