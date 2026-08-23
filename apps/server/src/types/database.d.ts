// @db-hash 239db0309a54e1af02ef4e7eea89720d
//该文件由脚本自动生成，请勿手动修改

export interface memories {
  content: string;
  createTime: number;
  embedding?: string | null;
  id?: string;
  isolationKey: string;
  name?: string | null;
  relatedMessageIds?: string | null;
  role?: string | null;
  summarized?: number | null;
  type: string;
}
export interface o_agentDeploy {
  desc?: string | null;
  disabled?: boolean | null;
  id?: number;
  key?: string | null;
  maxOutputTokens?: number | null;
  model?: string | null;
  modelName?: string | null;
  name?: string | null;
  temperature?: number | null;
  type?: string | null;
  vendorId?: string | null;
}
export interface o_agentWorkData {
  createTime?: number | null;
  data?: string | null;
  episodesId?: number | null;
  id?: number;
  key?: string | null;
  projectId?: number | null;
  updateTime?: number | null;
}
export interface o_artStyle {
  fileUrl?: string | null;
  id?: number;
  label?: string | null;
  name?: string | null;
  prompt?: string | null;
}
export interface o_assets {
  assetsId?: number | null;
  audioBindState?: number | null;
  describe?: string | null;
  flowId?: number | null;
  id?: number;
  imageId?: number | null;
  name?: string | null;
  projectId?: number | null;
  prompt?: string | null;
  promptErrorReason?: string | null;
  promptState?: string | null;
  remark?: string | null;
  scriptId?: number | null;
  startTime?: number | null;
  type?: string | null;
}
export interface o_assets2Storyboard {
  assetId?: number;
  storyboardId?: number;
}
export interface o_assetsRole2Audio {
  assetsAudioId?: number;
  assetsRoleId?: number;
}
export interface o_event {
  createTime?: number | null;
  detail?: string | null;
  id?: number;
  name?: string | null;
}
export interface o_eventChapter {
  eventId?: number | null;
  id?: number;
  novelId?: number | null;
}
export interface o_generation_asset_outputs {
  asset_id: number;
  created_at: number;
  image_id: number;
  job_id?: string | null;
  principal_id: string;
  project_id: number;
}
export interface o_generation_attempts {
  created_at: number;
  error_json?: string | null;
  id?: string | null;
  job_id: string;
  offering_id: string;
  provider_handle?: string | null;
  provider_id: string;
  provider_idempotency_key: string;
  sequence: number;
  state: string;
  updated_at: number;
}
export interface o_generation_job_events {
  created_at: number;
  from_state?: string | null;
  id?: number;
  job_id: string;
  metadata_json?: string | null;
  reason: string;
  sequence: number;
  to_state: string;
}
export interface o_generation_jobs {
  cancel_reason?: string | null;
  cancel_requested_at?: number | null;
  canonical_model_id: string;
  consumer_context_json?: string | null;
  consumer_key?: string | null;
  consumer_type?: string | null;
  created_at: number;
  deadline_at?: number | null;
  error_json?: string | null;
  id?: string | null;
  idempotency_key: string;
  import_attempt_count?: number;
  import_deadline_at?: number | null;
  import_payload_json?: string | null;
  input_json: string;
  lease_expires_at?: number | null;
  lease_owner?: string | null;
  next_run_at: number;
  offering_id: string;
  operation: string;
  parent_job_id?: string | null;
  poll_attempt_count?: number;
  principal_id: string;
  provider_handle?: string | null;
  provider_id: string;
  provider_outcome?: string | null;
  request_hash: string;
  result_json?: string | null;
  schema_version: string;
  state: string;
  updated_at: number;
  version: number;
}
export interface o_generation_reconciliations {
  action: string;
  actor: string;
  created_at: number;
  evidence_json?: string | null;
  id?: number;
  job_id: string;
  provider_handle?: string | null;
  reason: string;
}
export interface o_generation_workbench_outputs {
  created_at: number;
  job_id?: string | null;
  principal_id: string;
  project_id: number;
  script_id: number;
  track_id: number;
  video_id: number;
}
export interface o_image {
  assetsId?: number | null;
  errorReason?: string | null;
  filePath?: string | null;
  id?: number;
  model?: string | null;
  resolution?: string | null;
  state?: string | null;
  type?: string | null;
}
export interface o_imageFlow {
  flowData: string;
  id?: number;
}
export interface o_media_asset_owners {
  asset_id?: string;
  created_at: number;
  metadata_json?: string | null;
  principal_id?: string;
  project_id?: number | null;
  source_id?: string | null;
  source_kind: string;
}
export interface o_media_assets {
  byte_length: number;
  created_at: number;
  file_path: string;
  id?: string | null;
  metadata_json?: string | null;
  mime_type: string;
  sha256: string;
}
export interface o_modelPrompt {
  fileName?: string | null;
  id?: number;
  model?: string | null;
  path?: string | null;
  vendorId?: string | null;
}
export interface o_novel {
  chapter?: string | null;
  chapterData?: string | null;
  chapterIndex?: number | null;
  createTime?: number | null;
  errorReason?: string | null;
  event?: string | null;
  eventState?: number | null;
  id?: number;
  projectId?: number | null;
  reel?: string | null;
}
export interface o_project {
  artStyle?: string | null;
  createTime?: number | null;
  directorManual?: string | null;
  id?: number | null;
  imageModel?: string | null;
  imageOfferingId?: string | null;
  imageQuality?: string | null;
  intro?: string | null;
  mode?: string | null;
  name?: string | null;
  projectType?: string | null;
  type?: string | null;
  userId?: number | null;
  videoCanonicalModelId?: string | null;
  videoCatalogMode?: string | null;
  videoModel?: string | null;
  videoOfferingId?: string | null;
  videoOfferingPreferenceMode?: string | null;
  videoProviderId?: string | null;
  videoRatio?: string | null;
}
export interface o_prompt {
  data?: string | null;
  id?: number;
  name?: string | null;
  type?: string | null;
  useData?: string | null;
}
export interface o_provider_asset_cache {
  asset_sha256: string;
  cleanup_handle?: string | null;
  created_at: number;
  credential_scope: string;
  expires_at: number;
  id?: number;
  provider_asset_id: string;
  provider_id: string;
  updated_at: number;
}
export interface o_provider_credential_migrations {
  completed_at?: string | null;
  credential_fingerprint: string;
  provider_id?: string;
  slot?: string;
  started_at: string;
  state: string;
}
export interface o_provider_credential_refs {
  provider_id?: string;
  slot?: string;
  source: string;
  updated_at: string;
}
export interface o_provider_file_owners {
  created_at: number;
  credential_scope?: string;
  expires_at?: number | null;
  file_id?: string;
  filename?: string | null;
  media_type: string;
  principal_id?: string;
  provider_id?: string;
}
export interface o_provider_schema_migrations {
  applied_at: string;
  id?: string | null;
}
export interface o_script {
  content?: string | null;
  createTime?: number | null;
  errorReason?: string | null;
  extractState?: number | null;
  id?: number;
  name?: string | null;
  projectId?: number | null;
}
export interface o_scriptAssets {
  assetId?: number;
  scriptId?: number;
}
export interface o_setting {
  key?: string | null;
  value?: string | null;
}
export interface o_skillAttribution {
  attribution?: string;
  skillId?: string;
}
export interface o_skillList {
  createTime: number;
  description: string;
  embedding?: string | null;
  id?: string;
  md5: string;
  name: string;
  path: string;
  state: number;
  type: string;
  updateTime: number;
}
export interface o_storyboard {
  createTime?: number | null;
  duration?: string | null;
  filePath?: string | null;
  flowId?: number | null;
  id?: number;
  index?: number | null;
  projectId?: number | null;
  prompt?: string | null;
  reason?: string | null;
  scriptId?: number | null;
  shouldGenerateImage?: number | null;
  state?: string | null;
  track?: string | null;
  trackId?: number | null;
  videoDesc?: string | null;
}
export interface o_tasks {
  describe?: string | null;
  id?: number;
  model?: string | null;
  projectId?: number | null;
  reason?: string | null;
  relatedObjects?: string | null;
  startTime?: number | null;
  state?: string | null;
  taskClass?: string | null;
}
export interface o_user {
  id?: number;
  name?: string | null;
  password?: string | null;
  role?: string;
}
export interface o_vendorConfig {
  enable?: number | null;
  id?: string;
  inputValues?: string | null;
  models?: string | null;
}
export interface o_video {
  errorReason?: string | null;
  filePath?: string | null;
  id?: number;
  projectId?: number | null;
  scriptId?: number | null;
  state?: string | null;
  time?: number | null;
  videoTrackId?: number | null;
}
export interface o_videoTrack {
  duration?: number | null;
  id?: number;
  projectId?: number | null;
  prompt?: string | null;
  reason?: string | null;
  scriptId?: number | null;
  selectVideoId?: number | null;
  state?: string | null;
  videoId?: number | null;
}

export interface DB {
  memories: memories;
  o_agentDeploy: o_agentDeploy;
  o_agentWorkData: o_agentWorkData;
  o_artStyle: o_artStyle;
  o_assets: o_assets;
  o_assets2Storyboard: o_assets2Storyboard;
  o_assetsRole2Audio: o_assetsRole2Audio;
  o_event: o_event;
  o_eventChapter: o_eventChapter;
  o_generation_asset_outputs: o_generation_asset_outputs;
  o_generation_attempts: o_generation_attempts;
  o_generation_job_events: o_generation_job_events;
  o_generation_jobs: o_generation_jobs;
  o_generation_reconciliations: o_generation_reconciliations;
  o_generation_workbench_outputs: o_generation_workbench_outputs;
  o_image: o_image;
  o_imageFlow: o_imageFlow;
  o_media_asset_owners: o_media_asset_owners;
  o_media_assets: o_media_assets;
  o_modelPrompt: o_modelPrompt;
  o_novel: o_novel;
  o_project: o_project;
  o_prompt: o_prompt;
  o_provider_asset_cache: o_provider_asset_cache;
  o_provider_credential_migrations: o_provider_credential_migrations;
  o_provider_credential_refs: o_provider_credential_refs;
  o_provider_file_owners: o_provider_file_owners;
  o_provider_schema_migrations: o_provider_schema_migrations;
  o_script: o_script;
  o_scriptAssets: o_scriptAssets;
  o_setting: o_setting;
  o_skillAttribution: o_skillAttribution;
  o_skillList: o_skillList;
  o_storyboard: o_storyboard;
  o_tasks: o_tasks;
  o_user: o_user;
  o_vendorConfig: o_vendorConfig;
  o_video: o_video;
  o_videoTrack: o_videoTrack;
}
