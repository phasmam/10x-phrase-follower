import { describe, expect, it, vi } from "vitest";
import { FlashcardAudioCache } from "./flashcard-audio-cache";

function createCache() {
  const resolveAudioUrl = vi.fn(async (phraseId: string) => `https://audio.test/${phraseId}.mp3`);
  const fetchAudio = vi.fn(async () => new Blob(["audio"]));
  const createObjectUrl = vi.fn((_: Blob) => `blob:${createObjectUrl.mock.calls.length}`);
  const revokeObjectUrl = vi.fn();
  const cache = new FlashcardAudioCache({ resolveAudioUrl, fetchAudio, createObjectUrl, revokeObjectUrl });
  return { cache, resolveAudioUrl, fetchAudio, createObjectUrl, revokeObjectUrl };
}

describe("FlashcardAudioCache", () => {
  it("prefetches a current card and two following cards once", async () => {
    const { cache, resolveAudioUrl, fetchAudio } = createCache();

    await cache.prefetchWindow(["current", "next-1", "next-2"]);
    await cache.get("current");

    expect(resolveAudioUrl).toHaveBeenCalledTimes(3);
    expect(fetchAudio).toHaveBeenCalledTimes(3);
  });

  it("shares an in-flight prefetch with playback", async () => {
    let resolveFetch!: (value: Blob) => void;
    const fetchAudio = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const resolveAudioUrl = vi.fn(async () => "https://audio.test/current.mp3");
    const cache = new FlashcardAudioCache({
      resolveAudioUrl,
      fetchAudio,
      createObjectUrl: vi.fn(() => "blob:current"),
      revokeObjectUrl: vi.fn(),
    });

    const prefetch = cache.get("current");
    const playback = cache.get("current");
    await vi.waitFor(() => expect(fetchAudio).toHaveBeenCalledOnce());
    resolveFetch(new Blob(["audio"]));

    await expect(Promise.all([prefetch, playback])).resolves.toEqual(["blob:current", "blob:current"]);
    expect(resolveAudioUrl).toHaveBeenCalledTimes(1);
    expect(fetchAudio).toHaveBeenCalledTimes(1);
  });

  it("releases blobs that fall outside the next-two-card window and on dispose", async () => {
    const { cache, revokeObjectUrl } = createCache();

    await cache.prefetchWindow(["one", "two", "three"]);
    await cache.prefetchWindow(["two", "three", "four"]);

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:1");
    cache.dispose();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:2");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:3");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:4");
  });
});
