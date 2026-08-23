import { GoogleGenAI } from "@google/genai";

export interface GoogleNativeInteraction {
  id: string;
  status: string;
  output_text?: string;
  output_image?: { type: "image"; data?: string; uri?: string; mime_type?: string };
  output_video?: { type: "video"; data?: string; uri?: string; mime_type?: string };
  usage?: Record<string, unknown>;
  steps?: unknown[];
  errors?: unknown[];
}

export interface GoogleNativeVideoOperation {
  name?: string;
  done?: boolean;
  error?: Record<string, unknown>;
  response?: {
    generatedVideos?: Array<{
      video?: { uri?: string; videoBytes?: string; mimeType?: string };
    }>;
  };
}

export interface GoogleNativeFile {
  name?: string;
  uri?: string;
  displayName?: string;
  mimeType?: string;
  sizeBytes?: string;
  state?: "STATE_UNSPECIFIED" | "PROCESSING" | "ACTIVE" | "FAILED";
  expirationTime?: string;
  error?: { code?: number; message?: string; details?: Record<string, unknown>[] };
}

export interface GoogleNativeClient {
  interactions: {
    create(params: Record<string, unknown>): Promise<GoogleNativeInteraction>;
    get(id: string): Promise<GoogleNativeInteraction>;
    cancel(id: string): Promise<GoogleNativeInteraction>;
  };
  models: {
    generateVideos(params: Record<string, unknown>): Promise<GoogleNativeVideoOperation>;
  };
  operations: {
    getVideosOperation(params: {
      operation: GoogleNativeVideoOperation;
    }): Promise<GoogleNativeVideoOperation>;
  };
  files: {
    upload(params: {
      file: string | Blob;
      config?: Record<string, unknown>;
    }): Promise<GoogleNativeFile>;
    get(params: { name: string; config?: Record<string, unknown> }): Promise<GoogleNativeFile>;
  };
}

export type GoogleNativeClientFactory = (input: {
  apiKey: string;
  baseUrl?: string;
}) => GoogleNativeClient;

export const createGoogleNativeClient: GoogleNativeClientFactory = ({ apiKey, baseUrl }) =>
  new GoogleGenAI({
    apiKey,
    ...(baseUrl ? { httpOptions: { baseUrl, apiVersion: "" } } : {}),
  }) as unknown as GoogleNativeClient;
