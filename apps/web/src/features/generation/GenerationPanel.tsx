import { CircleStop, Image as ImageIcon, LoaderCircle, Play, RotateCcw, Video } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  api,
  type CapabilityField,
  type CatalogResult,
  type GenerationJob,
  type GenerationOperation,
} from "@/api/client";
import {
  buildGenerationRequest,
  extractMediaArtifact,
  isTerminalJob,
} from "@/features/generation/contracts";

function initialFieldValue(field: CapabilityField): string | number | boolean {
  if (field.path === "aspectRatio" && field.enumValues?.includes("16:9")) return "16:9";
  if (field.kind === "enum") return field.enumValues?.[0] ?? field.allowedValues?.[0] ?? "";
  if (field.kind === "integer") return field.minimum ?? 1;
  if (field.kind === "boolean") return false;
  return "";
}

function statusLabel(job: GenerationJob | undefined) {
  if (!job) return "准备就绪";
  const labels: Record<GenerationJob["state"], string> = {
    queued: "已排队",
    preparing_assets: "准备素材",
    submitting: "正在提交",
    submitted: "已提交",
    remote_queued: "服务商排队中",
    running: "正在生成",
    importing: "正在保存结果",
    submission_unknown: "等待人工核对",
    succeeded: "生成完成",
    failed: "生成失败",
    cancelled: "已取消",
    abandoned: "已放弃",
  };
  return labels[job.state];
}

function CapabilityFieldControl(props: {
  field: CapabilityField;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const { field, value, onChange } = props;
  if (field.kind === "boolean") {
    return (
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span>{field.label}</span>
      </label>
    );
  }
  if (field.kind === "enum") {
    const options = field.enumValues ?? field.allowedValues?.map(String) ?? [];
    return (
      <label>
        <span>{field.label}</span>
        <select value={String(value)} onChange={(event) => onChange(event.currentTarget.value)}>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  }
  if (field.kind === "integer") {
    return (
      <label>
        <span>{field.label}</span>
        <input
          type="number"
          value={Number(value)}
          min={field.minimum}
          max={field.maximum}
          onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
          required={field.required}
        />
      </label>
    );
  }
  return (
    <label className={field.path === "prompt" ? "prompt-field" : undefined}>
      <span>{field.label}</span>
      {field.path === "prompt" ? (
        <textarea
          value={String(value)}
          onChange={(event) => onChange(event.currentTarget.value)}
          rows={4}
          maxLength={field.maximumLength}
          required={field.required}
          placeholder="描述主体、环境、镜头与光线…"
        />
      ) : (
        <input
          value={String(value)}
          onChange={(event) => onChange(event.currentTarget.value)}
          required={field.required}
        />
      )}
    </label>
  );
}

export function GenerationPanel(props: {
  operation: GenerationOperation;
  projectId: number;
  catalog: CatalogResult;
  token: string;
}) {
  const queryClient = useQueryClient();
  const offerings = useMemo(
    () =>
      props.catalog.offerings.filter(
        (offering) =>
          offering.support.implementation === "implemented" &&
          offering.operations.some(
            (operation) => operation.operation === props.operation && operation.enabled,
          ),
      ),
    [props.catalog.offerings, props.operation],
  );
  const [offeringId, setOfferingId] = useState(offerings[0]?.id ?? "");
  const offering = offerings.find((candidate) => candidate.id === offeringId) ?? offerings[0];
  const operationDescriptor = offering?.operations.find(
    (candidate) => candidate.operation === props.operation,
  );
  const schema = props.catalog.capabilitySchemas.find(
    (candidate) => candidate.id === operationDescriptor?.capabilitySchemaId,
  );
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    setOfferingId(offerings[0]?.id ?? "");
  }, [offerings]);

  useEffect(() => {
    setValues(
      Object.fromEntries(
        (schema?.fields ?? []).map((field) => [field.path, initialFieldValue(field)]),
      ),
    );
    setJobId(null);
    setMediaUrl(null);
    setMediaError(null);
  }, [schema]);

  const job = useQuery({
    queryKey: ["generation-job", jobId],
    queryFn: () => api.job(props.token, jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) =>
      isTerminalJob(query.state.data as GenerationJob | undefined) ? false : 600,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!offering || !schema) throw new Error("当前没有可用的生成能力");
      return api.submitJob(
        props.token,
        buildGenerationRequest({
          projectId: props.projectId,
          operation: props.operation,
          offering,
          schema,
          values,
        }),
      );
    },
    onSuccess: (nextJob) => {
      setJobId(nextJob.id);
      queryClient.setQueryData(["generation-job", nextJob.id], nextJob);
    },
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelJob(props.token, jobId!),
    onSuccess: (nextJob) => queryClient.setQueryData(["generation-job", nextJob.id], nextJob),
  });
  const currentJob = job.data ?? submit.data;
  const availability = props.catalog.availability.find(
    (candidate) => candidate.offeringId === offering?.id,
  );
  const available = availability?.available ?? true;

  useEffect(() => {
    const artifact = extractMediaArtifact(currentJob?.result);
    setMediaError(null);
    if (currentJob?.state !== "succeeded") {
      setMediaUrl(null);
      return;
    }
    if (!artifact) {
      setMediaUrl(null);
      setMediaError("生成已完成，但结果中没有可显示的媒体素材");
      return;
    }
    if (artifact.url) {
      setMediaUrl(artifact.url);
      return;
    }
    if (!artifact.assetId) return;
    let revokedUrl: string | null = null;
    let active = true;
    void api
      .mediaAsset(props.token, artifact.assetId)
      .then((blob) => {
        if (!active) return;
        revokedUrl = URL.createObjectURL(blob);
        setMediaUrl(revokedUrl);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMediaError(error instanceof Error ? error.message : "生成素材读取失败");
      });
    return () => {
      active = false;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [currentJob, props.token]);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit.mutate();
  }

  const isImage = props.operation === "image.generate";
  return (
    <section className="generation-panel" aria-label={isImage ? "画面生成" : "视频生成"}>
      <header>
        <span className="generation-icon">
          {isImage ? <ImageIcon size={20} /> : <Video size={20} />}
        </span>
        <div>
          <h2>{isImage ? "生成画面" : "生成视频"}</h2>
          <p>
            {isImage
              ? "把镜头描述变成可复用的视觉素材"
              : "从文本或关键帧生成可进入剪辑轨的运动素材"}
          </p>
        </div>
      </header>
      {offerings.length === 0 || !offering || !schema ? (
        <div className="capability-unavailable" role="status">
          当前目录没有已实现的{isImage ? "图像" : "视频"}能力。
        </div>
      ) : (
        <form className="generation-form stack-form" onSubmit={submitForm}>
          <label>
            <span>模型服务</span>
            <select
              value={offering.id}
              onChange={(event) => setOfferingId(event.currentTarget.value)}
            >
              {offerings.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.providerId} / {candidate.providerModelId}
                </option>
              ))}
            </select>
          </label>
          <div className="generation-fields">
            {schema.fields
              .filter((field) => field.kind !== "assets" && !field.advanced)
              .map((field) => (
                <CapabilityFieldControl
                  key={field.path}
                  field={field}
                  value={values[field.path] ?? initialFieldValue(field)}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, [field.path]: value }))
                  }
                />
              ))}
          </div>
          {!available ? (
            <p className="capability-unavailable" role="status">
              服务尚未就绪：{availability?.reasons.join(" · ") || "请先配置模型服务"}
            </p>
          ) : null}
          {submit.error || job.error || cancel.error ? (
            <p className="form-error" role="alert">
              {(submit.error ?? job.error ?? cancel.error)?.message}
            </p>
          ) : null}
          {mediaError ? (
            <p className="form-error" role="alert">
              {mediaError}
            </p>
          ) : null}
          <div className="generation-actions">
            <button
              className="button primary"
              disabled={
                !available || submit.isPending || Boolean(currentJob && !isTerminalJob(currentJob))
              }
              type="submit"
            >
              {submit.isPending ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}
              {currentJob && isTerminalJob(currentJob) ? "再次生成" : "开始生成"}
            </button>
            {currentJob && !isTerminalJob(currentJob) ? (
              <button
                className="button ghost"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
                type="button"
              >
                <CircleStop size={16} />
                取消
              </button>
            ) : null}
            {currentJob && isTerminalJob(currentJob) ? (
              <button
                className="button ghost"
                onClick={() => {
                  setJobId(null);
                  submit.reset();
                }}
                type="button"
              >
                <RotateCcw size={16} />
                清空结果
              </button>
            ) : null}
            <span className="job-status" data-state={currentJob?.state}>
              {statusLabel(currentJob)}
            </span>
          </div>
        </form>
      )}
      {mediaUrl && currentJob?.state === "succeeded" ? (
        <figure className="media-result">
          {isImage ? (
            <img
              src={mediaUrl}
              alt="生成的镜头画面"
              onError={() => {
                setMediaUrl(null);
                setMediaError("生成画面加载失败");
              }}
            />
          ) : (
            <video
              src={mediaUrl}
              controls
              playsInline
              aria-label="生成的视频"
              onError={() => {
                setMediaUrl(null);
                setMediaError("生成视频加载失败");
              }}
            />
          )}
          <figcaption>
            <strong>{isImage ? "画面已就绪" : "视频已就绪"}</strong>
            <span>
              {currentJob.providerId} · {currentJob.offeringId}
            </span>
          </figcaption>
        </figure>
      ) : null}
    </section>
  );
}
