import {
  CircleStop,
  Image as ImageIcon,
  LoaderCircle,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
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
  assetModeViolation,
  extractMediaArtifact,
  isTerminalJob,
  type CapabilityAssetMode,
  type GenerationAssetInput,
} from "@/features/generation/contracts";

interface UploadedGenerationAsset {
  input: GenerationAssetInput;
  filename: string;
  mediaType: string;
  byteLength: number;
}

function initialFieldValue(field: CapabilityField): string | number | boolean {
  if (field.path === "aspectRatio" && field.enumValues?.includes("16:9")) return "16:9";
  if (field.kind === "enum") return field.enumValues?.[0] ?? field.allowedValues?.[0] ?? "";
  if (field.kind === "integer") return field.minimum ?? 1;
  if (field.kind === "boolean") return false;
  return "";
}

function fieldForMode(field: CapabilityField, mode: CapabilityAssetMode | undefined) {
  const rule = mode?.fieldRules?.find((candidate) => candidate.path === field.path);
  return {
    ...field,
    ...(rule?.required === undefined ? {} : { required: rule.required }),
    ...(rule?.enumValues ? { enumValues: rule.enumValues } : {}),
    ...(rule?.allowedValues ? { allowedValues: rule.allowedValues } : {}),
  };
}

function normalizeValuesForMode(
  fields: CapabilityField[],
  mode: CapabilityAssetMode | undefined,
  values: Record<string, string | number | boolean>,
) {
  return Object.fromEntries(
    fields.map((field) => {
      const effective = fieldForMode(field, mode);
      const current = values[field.path];
      const allowed = effective.enumValues ?? effective.allowedValues;
      return [
        field.path,
        current !== undefined && (!allowed || allowed.includes(current))
          ? current
          : initialFieldValue(effective),
      ];
    }),
  );
}

function acceptForKinds(kinds: readonly ("image" | "video" | "audio")[]) {
  return kinds.map((kind) => `${kind}/*`).join(",");
}

async function durationSeconds(file: File): Promise<number | undefined> {
  if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) return undefined;
  const url = URL.createObjectURL(file);
  const media = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
  try {
    return await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("无法读取素材时长")), 10_000);
      media.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        Number.isFinite(media.duration)
          ? resolve(media.duration)
          : reject(new Error("素材时长无效"));
      };
      media.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("无法读取素材元数据"));
      };
      media.preload = "metadata";
      media.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
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
  const [modeId, setModeId] = useState("");
  const [uploadedAssets, setUploadedAssets] = useState<UploadedGenerationAsset[]>([]);
  const [uploadingRole, setUploadingRole] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [parentJobId, setParentJobId] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    setOfferingId(offerings[0]?.id ?? "");
  }, [offerings]);

  useEffect(() => {
    const defaultMode =
      schema?.assetModes?.find((candidate) => candidate.id === "text") ?? schema?.assetModes?.[0];
    setModeId(defaultMode?.id ?? "");
    setValues(normalizeValuesForMode(schema?.fields ?? [], defaultMode, {}));
    setUploadedAssets([]);
    setAssetError(null);
    setParentJobId("");
    setJobId(null);
    setMediaUrl(null);
    setMediaError(null);
  }, [schema]);

  const selectedMode = schema?.assetModes?.find((candidate) => candidate.id === modeId);
  const effectiveFields = useMemo(
    () => (schema?.fields ?? []).map((field) => fieldForMode(field, selectedMode)),
    [schema?.fields, selectedMode],
  );
  const generationAssets = uploadedAssets.map((asset) => asset.input);
  const assetViolation = assetModeViolation(selectedMode, generationAssets, parentJobId);

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
          mode: selectedMode?.id,
          assets: generationAssets,
          parentJobId: selectedMode?.requiresContinuation ? parentJobId.trim() : undefined,
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
    (candidate) => candidate.offeringId === offering?.id && candidate.operation === props.operation,
  );
  const available = availability?.available ?? true;

  async function uploadAssets(role: CapabilityAssetMode["roles"][number], files: FileList | null) {
    if (!files?.length) return;
    const currentCount = uploadedAssets.filter((asset) => asset.input.role === role.role).length;
    const selectedFiles = Array.from(files).slice(0, Math.max(0, role.maximum - currentCount));
    setUploadingRole(role.role);
    setAssetError(null);
    try {
      const nextAssets: UploadedGenerationAsset[] = [];
      for (const file of selectedFiles) {
        const uploaded = await api.uploadMediaAsset(props.token, file);
        if (uploaded.kind === "file" || !role.kinds.includes(uploaded.kind)) {
          throw new Error(`${file.name} 不符合 ${role.role} 的素材类型要求`);
        }
        const duration = await durationSeconds(file);
        nextAssets.push({
          input: {
            assetId: uploaded.assetId,
            kind: uploaded.kind,
            role: role.role,
            ...(duration === undefined ? {} : { durationSeconds: duration }),
          },
          filename: uploaded.filename,
          mediaType: uploaded.mediaType,
          byteLength: uploaded.byteLength,
        });
      }
      setUploadedAssets((current) => [...current, ...nextAssets]);
    } catch (cause) {
      setAssetError(cause instanceof Error ? cause.message : "素材上传失败");
    } finally {
      setUploadingRole(null);
    }
  }

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
          {schema.assetModes && schema.assetModes.length > 0 ? (
            <label>
              <span>生成模式</span>
              <select
                value={selectedMode?.id ?? ""}
                onChange={(event) => {
                  const nextMode = schema.assetModes?.find(
                    (candidate) => candidate.id === event.currentTarget.value,
                  );
                  setModeId(event.currentTarget.value);
                  setValues((current) => normalizeValuesForMode(schema.fields, nextMode, current));
                  setUploadedAssets([]);
                  setAssetError(null);
                  setParentJobId("");
                }}
              >
                {schema.assetModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="generation-fields">
            {effectiveFields
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
          {selectedMode?.requiresContinuation ? (
            <label>
              <span>父任务 ID</span>
              <input
                value={parentJobId}
                onChange={(event) => setParentJobId(event.currentTarget.value)}
                placeholder="从任务中心复制一个已完成任务 ID"
                required
              />
            </label>
          ) : null}
          {selectedMode && selectedMode.roles.length > 0 ? (
            <section className="asset-mode-inputs" aria-label="生成素材">
              {selectedMode.roles.map((role) => {
                const roleAssets = uploadedAssets.filter((asset) => asset.input.role === role.role);
                return (
                  <div className="asset-role" key={role.role}>
                    <div>
                      <strong>{role.role}</strong>
                      <small>
                        {role.kinds.join(" / ")} · {role.minimum}–{role.maximum}
                      </small>
                    </div>
                    <label className="asset-upload-button">
                      {uploadingRole === role.role ? (
                        <LoaderCircle className="spin" size={15} />
                      ) : (
                        <Upload size={15} />
                      )}
                      <span>上传素材</span>
                      <input
                        type="file"
                        accept={acceptForKinds(role.kinds)}
                        multiple={role.maximum > 1}
                        disabled={uploadingRole !== null || roleAssets.length >= role.maximum}
                        onChange={(event) => {
                          void uploadAssets(role, event.currentTarget.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {roleAssets.length > 0 ? (
                      <ul>
                        {roleAssets.map((asset) => (
                          <li key={`${asset.input.assetId}:${asset.input.role}`}>
                            <span>
                              {asset.filename}
                              <small>{asset.mediaType}</small>
                            </span>
                            <button
                              className="icon-button danger"
                              type="button"
                              aria-label={`移除 ${asset.filename}`}
                              onClick={() =>
                                setUploadedAssets((current) =>
                                  current.filter((candidate) => candidate !== asset),
                                )
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}
          {assetError ? (
            <p className="form-error" role="alert">
              {assetError}
            </p>
          ) : null}
          {assetViolation && selectedMode?.roles.length ? (
            <p className="capability-hint" role="status">
              {assetViolation}
            </p>
          ) : null}
          {!available ? (
            <p className="capability-unavailable" role="status">
              服务尚未就绪：{availability?.reasonCodes.join(" · ") || "请先配置模型服务"}
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
                !available ||
                submit.isPending ||
                Boolean(currentJob && !isTerminalJob(currentJob)) ||
                Boolean(assetViolation) ||
                uploadingRole !== null
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
