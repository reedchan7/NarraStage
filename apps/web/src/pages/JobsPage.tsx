import { CircleStop, Clipboard, ExternalLink, ListChecks } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { extractMediaArtifact, isTerminalJob } from "@/features/generation/contracts";
import { useSession } from "@/state/session";

export function JobsPage() {
  const token = useSession((state) => state.session?.token ?? "");
  const queryClient = useQueryClient();
  const jobs = useQuery({
    queryKey: ["generation-jobs"],
    queryFn: () => api.jobs(token),
    refetchInterval: (query) =>
      query.state.data?.jobs.some((job) => !isTerminalJob(job)) ? 1_500 : false,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelJob(token, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["generation-jobs"] }),
  });

  async function openOwnedAsset(assetId: string) {
    const blob = await api.mediaAsset(token, assetId);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">NARRASTAGE / JOBS</p>
          <h1>生成任务</h1>
          <p>恢复、核对并继续处理持久化的图像与视频任务。</p>
        </div>
      </header>
      {jobs.isPending ? (
        <div className="studio-loading" role="status">
          正在读取任务…
        </div>
      ) : jobs.isError ? (
        <section className="empty-state" role="alert">
          <strong>任务读取失败</strong>
          <p>{jobs.error.message}</p>
        </section>
      ) : jobs.data.jobs.length === 0 ? (
        <section className="empty-state">
          <ListChecks size={24} />
          <strong>还没有生成任务</strong>
          <p>从制作台提交图像或视频任务后，会在这里持续保留状态。</p>
        </section>
      ) : (
        <section className="job-list" aria-label="生成任务列表">
          {jobs.data.jobs.map((job) => {
            const artifact = extractMediaArtifact(job.result);
            return (
              <article className="job-card" key={job.id}>
                <header>
                  <span className="job-status" data-state={job.state}>
                    {job.state}
                  </span>
                  <time>{new Date(job.updatedAt).toLocaleString()}</time>
                </header>
                <div>
                  <h2>{job.operation}</h2>
                  <p>
                    {job.providerId} · {job.offeringId}
                  </p>
                  <code>{job.id}</code>
                </div>
                <footer>
                  <button
                    className="button compact secondary"
                    onClick={() => void navigator.clipboard.writeText(job.id)}
                    type="button"
                  >
                    <Clipboard size={14} />
                    复制 ID
                  </button>
                  {artifact?.url ? (
                    <a
                      className="button compact secondary"
                      href={artifact.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} />
                      打开结果
                    </a>
                  ) : null}
                  {artifact?.assetId ? (
                    <button
                      className="button compact secondary"
                      onClick={() => void openOwnedAsset(artifact.assetId!)}
                      type="button"
                    >
                      <ExternalLink size={14} />
                      打开结果
                    </button>
                  ) : null}
                  {!isTerminalJob(job) ? (
                    <button
                      className="button compact ghost"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(job.id)}
                      type="button"
                    >
                      <CircleStop size={14} />
                      取消
                    </button>
                  ) : null}
                </footer>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
