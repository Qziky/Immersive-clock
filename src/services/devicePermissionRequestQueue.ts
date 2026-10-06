const waitingPermissionRequests: Array<() => void> = [];
let isPermissionRequestActive = false;

function startNextPermissionRequest(): void {
  const nextRequest = waitingPermissionRequests.shift();
  if (nextRequest) nextRequest();
  else isPermissionRequestActive = false;
}

export function withDevicePermissionRequest<T>(request: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const runRequest = () => {
      isPermissionRequestActive = true;
      let result: Promise<T>;
      try {
        result = request();
      } catch (error) {
        reject(error);
        startNextPermissionRequest();
        return;
      }
      void result
        .then(resolve, reject)
        .then(startNextPermissionRequest, startNextPermissionRequest);
    };

    if (isPermissionRequestActive) waitingPermissionRequests.push(runRequest);
    else runRequest();
  });
}
