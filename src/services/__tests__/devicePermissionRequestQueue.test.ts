import { describe, expect, it } from "vitest";

import { withDevicePermissionRequest } from "../devicePermissionRequestQueue";

describe("device permission request queue", () => {
  it("serializes permission prompts until the active request settles", async () => {
    const order: string[] = [];
    let finishLocationRequest: () => void = () => undefined;

    const locationRequest = withDevicePermissionRequest(
      () =>
        new Promise<void>((resolve) => {
          order.push("location");
          finishLocationRequest = resolve;
        })
    );
    const microphoneRequest = withDevicePermissionRequest(async () => {
      order.push("microphone");
    });

    await Promise.resolve();
    expect(order).toEqual(["location"]);

    finishLocationRequest();
    await Promise.all([locationRequest, microphoneRequest]);

    expect(order).toEqual(["location", "microphone"]);
  });

  it("continues after a permission request rejects", async () => {
    await expect(
      withDevicePermissionRequest(() => Promise.reject(new Error("denied")))
    ).rejects.toThrow("denied");

    await expect(withDevicePermissionRequest(async () => "next request")).resolves.toBe(
      "next request"
    );
  });
});
