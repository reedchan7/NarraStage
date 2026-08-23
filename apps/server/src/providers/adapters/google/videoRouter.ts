import type {
  OperationContext,
  OperationRequest,
  VideoCancelPort,
  VideoGeneratePort,
  VideoStatusPort,
} from "@/providers/ports";
import type { CapabilityInput } from "@/providers/domain/capabilities";
import { decodeGoogleHandle } from "@/providers/adapters/google/handle";
import { resolveGoogleOffering } from "@/providers/adapters/google/manifest";
import { GoogleOmniAdapter } from "@/providers/adapters/google/omniAdapter";
import { GoogleVeoAdapter } from "@/providers/adapters/google/veoAdapter";

export class GoogleVideoGenerateRouter implements VideoGeneratePort {
  readonly operation = "video.generate" as const;
  readonly #veo: GoogleVeoAdapter;
  readonly #omni: GoogleOmniAdapter;

  constructor(veo: GoogleVeoAdapter, omni: GoogleOmniAdapter) {
    this.#veo = veo;
    this.#omni = omni;
  }

  start(request: OperationRequest<CapabilityInput>, context?: OperationContext) {
    const offering = resolveGoogleOffering(request.offeringId);
    if (offering.kind === "veo-video") return this.#veo.start(request, context);
    if (offering.kind === "omni-video") return this.#omni.start(request, context);
    throw new Error("google.video_offering_required");
  }
}

export class GoogleVideoStatusRouter implements VideoStatusPort {
  readonly operation = "video.status" as const;
  readonly #veo: GoogleVeoAdapter;
  readonly #omni: GoogleOmniAdapter;

  constructor(veo: GoogleVeoAdapter, omni: GoogleOmniAdapter) {
    this.#veo = veo;
    this.#omni = omni;
  }

  status(providerHandle: string, context?: OperationContext) {
    return decodeGoogleHandle(providerHandle).kind === "veo"
      ? this.#veo.status(providerHandle, context)
      : this.#omni.status(providerHandle, context);
  }
}

export class GoogleVideoCancelRouter implements VideoCancelPort {
  readonly operation = "video.cancel" as const;
  readonly #veo: GoogleVeoAdapter;
  readonly #omni: GoogleOmniAdapter;

  constructor(veo: GoogleVeoAdapter, omni: GoogleOmniAdapter) {
    this.#veo = veo;
    this.#omni = omni;
  }

  cancel(providerHandle: string, context?: OperationContext) {
    return decodeGoogleHandle(providerHandle).kind === "veo"
      ? this.#veo.cancel(providerHandle, context)
      : this.#omni.cancel(providerHandle);
  }
}
