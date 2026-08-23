<template>
  <div class="attachmentComposer">
    <input ref="fileInput" class="fileInput" type="file" multiple :accept="acceptedMediaTypes" @change="onInputChange" />
    <t-button
      shape="square"
      variant="outline"
      size="small"
      :aria-label="$t('chat.attachments.add')"
      :title="$t('chat.attachments.add')"
      :disabled="disabled || uploading || !target?.acceptsAttachments"
      @click="fileInput?.click()">
      <template #icon><i-pic size="16" /></template>
    </t-button>
    <span v-if="uploading" class="uploading" role="status">{{ $t("chat.attachments.uploading") }}</span>
    <div v-if="modelValue.length" class="attachmentList" :aria-label="$t('chat.attachments.list')">
      <div v-for="attachment in modelValue" :key="attachment.id" class="attachmentItem">
        <span class="filename" :title="attachment.filename">{{ attachment.filename }}</span>
        <t-tag size="small" variant="light">
          {{ attachment.source.type === "inline" ? $t("chat.attachments.inline") : $t("chat.attachments.files") }}
        </t-tag>
        <t-select
          v-if="attachment.source.type === 'inline' && attachment.mediaType.startsWith('image/')"
          class="detailSelect"
          size="small"
          :model-value="attachment.detail"
          :aria-label="$t('chat.attachments.detail')"
          @change="updateDetail(attachment.id, $event)">
          <t-option v-for="detail in detailOptions" :key="detail" :value="detail" :label="$t(`chat.attachments.detail.${detail}`)" />
        </t-select>
        <t-button variant="text" shape="square" size="small" :aria-label="$t('chat.attachments.remove')" @click="removeAttachment(attachment.id)">
          <template #icon><i-close size="14" /></template>
        </t-button>
      </div>
    </div>
    <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { prepareChatAttachment, type AgentModelDetails, type ChatAttachment, type ChatImageDetail } from "./attachments";

const props = withDefaults(
  defineProps<{
    modelValue: ChatAttachment[];
    target: AgentModelDetails | null;
    disabled?: boolean;
    maximum?: number;
  }>(),
  { disabled: false, maximum: 8 },
);

const emit = defineEmits<{
  "update:modelValue": [attachments: ChatAttachment[]];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const errorMessage = ref("");
const detailOptions: ChatImageDetail[] = ["auto", "low", "high", "original"];
const acceptedMediaTypes = computed(() => props.target?.supportedMediaTypes.join(",") ?? "");

function translatedError(error: unknown): string {
  const code = error instanceof Error ? error.message : "chat.attachments.upload_failed";
  return $t(code.startsWith("chat.attachments.") ? code : "chat.attachments.upload_failed");
}

async function addFiles(files: readonly File[]) {
  if (!props.target?.acceptsAttachments) {
    errorMessage.value = $t("chat.attachments.model_not_supported");
    return;
  }
  const maximum = Math.min(props.maximum, props.target.maximumAttachments);
  if (props.modelValue.length + files.length > maximum) {
    errorMessage.value = $t("chat.attachments.count_exceeded", { maximum });
    return;
  }
  uploading.value = true;
  errorMessage.value = "";
  try {
    const prepared: ChatAttachment[] = [];
    for (const file of files) prepared.push(await prepareChatAttachment(file, props.target));
    emit("update:modelValue", [...props.modelValue, ...prepared]);
  } catch (error) {
    errorMessage.value = translatedError(error);
  } finally {
    uploading.value = false;
  }
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  void addFiles(files);
}

function removeAttachment(id: string) {
  emit(
    "update:modelValue",
    props.modelValue.filter((attachment) => attachment.id !== id),
  );
}

function updateDetail(id: string, value: unknown) {
  if (!detailOptions.includes(value as ChatImageDetail)) return;
  emit(
    "update:modelValue",
    props.modelValue.map((attachment) => (attachment.id === id ? { ...attachment, detail: value as ChatImageDetail } : attachment)),
  );
}

defineExpose({ addFiles });
</script>

<style scoped>
.attachmentComposer {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.fileInput {
  display: none;
}

.uploading,
.errorMessage {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.errorMessage {
  width: 100%;
  color: var(--td-error-color);
}

.attachmentList {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.attachmentItem {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 360px;
  padding: 3px 4px 3px 8px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-secondarycontainer);
}

.filename {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.detailSelect {
  width: 92px;
}
</style>
