import { afterEach } from "vitest";
import { config, enableAutoUnmount } from "@vue/test-utils";

enableAutoUnmount(afterEach);

Object.assign(globalThis, {
  $t: (key: string) => key,
});

config.global.mocks = {
  ...config.global.mocks,
  $t: (key: string) => key,
};
