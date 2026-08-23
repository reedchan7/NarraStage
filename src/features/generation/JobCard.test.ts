import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import JobCard from "@/features/generation/JobCard.vue";
import type { GenerationJobView } from "@/features/generation/jobStore";

function job(state: GenerationJobView["state"]): GenerationJobView {
  return {
    id: "77826246-b351-445f-910d-262b51448310",
    schemaVersion: "2.0.0",
    idempotencyKey: "request-123",
    canonicalModelId: "minimax:h3",
    offeringId: "minimax:h3:fal",
    providerId: "fal",
    operation: "video.generate",
    input: { mode: "text", values: { prompt: "Boat" }, assets: [] },
    state,
    nextRunAt: 1,
    pollAttemptCount: 0,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    requiresReconciliation: state === "submission_unknown",
  };
}

describe("JobCard", () => {
  test("offers cancellation only for active jobs", async () => {
    const wrapper = mount(JobCard, { props: { job: job("running") } });
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("cancel")?.[0]).toEqual(["77826246-b351-445f-910d-262b51448310"]);
    await wrapper.setProps({ job: job("succeeded") });
    expect(wrapper.find("button").exists()).toBe(false);
  });

  test("makes unknown submission reconciliation explicit", () => {
    const wrapper = mount(JobCard, { props: { job: job("submission_unknown") } });
    expect(wrapper.get('[role="alert"]').text()).toContain("providerPlatform.reconciliationRequired");
    expect(wrapper.findAll("button")).toHaveLength(2);
  });

  test("offers an explicit retry after provider success but owned-storage import failure", async () => {
    const resumable = { ...job("failed"), error: { resumableImport: true } };
    const wrapper = mount(JobCard, { props: { job: resumable } });
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("resumeImport")?.[0]).toEqual([
      "77826246-b351-445f-910d-262b51448310",
    ]);
  });
});
