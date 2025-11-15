import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobWorker } from "../lib/job-worker";

// Mock randomUUID from node:crypto
vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid-123"),
}));

describe("JobWorker", () => {
  let worker: JobWorker;
  let mockSupabase: unknown;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a more comprehensive mock
    mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({
              data: null,
              error: null,
            })),
          })),
        })),
        insert: vi.fn(() => ({
          data: null,
          error: null,
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      })),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      },
      rpc: vi.fn(() => ({
        data: null,
        error: null,
      })),
    };

    worker = new JobWorker("http://localhost:54321", "test-service-key");
    // Replace the supabase client with our mock
    (worker as { supabase: unknown }).supabase = mockSupabase;
  });

  it("should be created with valid configuration", () => {
    expect(worker).toBeDefined();
  });

  it("should handle job processing errors gracefully", async () => {
    // Mock a job that doesn't exist
    const mockFrom = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: null,
            error: { message: "Job not found" },
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          data: null,
          error: null,
        })),
      })),
    }));

    mockSupabase.from = mockFrom;

    // The job worker catches errors and updates job state, so it doesn't throw
    await expect(worker.processJob("non-existent-job")).resolves.toBeUndefined();
  });

  it("should update job state correctly", async () => {
    const mockUpdate = vi.fn(() => ({
      eq: vi.fn(() => ({
        data: null,
        error: null,
      })),
    }));

    const mockFrom = vi.fn(() => ({
      update: mockUpdate,
    }));

    mockSupabase.from = mockFrom;

    await (
      worker as { updateJobState: (jobId: string, state: string, startedAt: string) => Promise<void> }
    ).updateJobState("test-job", "running", "2023-01-01T00:00:00Z");

    expect(mockFrom).toHaveBeenCalledWith("jobs");
    expect(mockUpdate).toHaveBeenCalledWith({
      state: "running",
      started_at: "2023-01-01T00:00:00Z",
    });
  });

  it("should create build successfully", async () => {
    const mockInsert = vi.fn(() => ({
      data: null,
      error: null,
    }));

    const mockFrom = vi.fn(() => ({
      insert: mockInsert,
    }));

    mockSupabase.from = mockFrom;

    const buildId = await (
      worker as { createBuild: (notebookId: string, jobId: string) => Promise<string> }
    ).createBuild("test-notebook", "test-job");

    expect(buildId).toBe("test-uuid-123");
    expect(mockFrom).toHaveBeenCalledWith("builds");
    expect(mockInsert).toHaveBeenCalledWith({
      id: "test-uuid-123",
      notebook_id: "test-notebook",
      job_id: "test-job",
    });
  });
});
