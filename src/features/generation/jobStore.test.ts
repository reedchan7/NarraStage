import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useGenerationJobStore } from "@/features/generation/jobStore";

const { axiosMock } = vi.hoisted(() => ({
  axiosMock: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/utils/axios", () => ({ default: axiosMock }));
vi.mock("socket.io-client", () => ({ io: vi.fn() }));

function job(id: number) {
  return {
    id: `job-${id}`,
    state: "submitted",
    version: 1,
    updatedAt: 1_000 - id,
  } as never;
}

describe("generation job recovery pagination", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    axiosMock.get.mockReset();
  });

  test("loads every recovery page beyond the first 100 jobs", async () => {
    axiosMock.get
      .mockResolvedValueOnce({
        data: {
          jobs: Array.from({ length: 100 }, (_, index) => job(index)),
          nextCursor: "page-2",
        },
      })
      .mockResolvedValueOnce({
        data: { jobs: Array.from({ length: 50 }, (_, index) => job(index + 100)) },
      });

    const store = useGenerationJobStore();
    await store.refresh();

    expect(store.jobs).toHaveLength(150);
    expect(axiosMock.get).toHaveBeenNthCalledWith(2, "/v2/jobs", {
      params: { limit: 100, recovery: true, cursor: "page-2" },
    });
  });
});
