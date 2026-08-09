import { useEffect } from "react";

import { useUpdateSnapshot } from "../../hooks/useUpdateRuntime";
import {
  dismissUpdateNotice,
  executeUpdateAction,
  isAutomaticCheckEnabled,
  isUpdateNoticeSuppressed,
  startUpdateRuntime,
  UPDATE_NOTICE_ID_EXPORT,
} from "../../services/update/updateRuntime";
import { Button, useFeedback } from "../../ui";

import styles from "./UpdateNotice.module.css";

function getDownloadActionLabel(platform: string): string {
  return platform === "electron" ? "发布页" : "下载";
}

export function UpdateNotice() {
  const snapshot = useUpdateSnapshot();
  const { dismiss, notify } = useFeedback();

  useEffect(() => startUpdateRuntime(), []);

  useEffect(() => {
    if (snapshot.platform === "web") {
      dismiss(UPDATE_NOTICE_ID_EXPORT);
      return;
    }

    const isRestartNotice =
      snapshot.platform === "electron" &&
      snapshot.status === "ready" &&
      snapshot.action === "install";
    const isDownloadNotice =
      snapshot.status === "available" &&
      ((snapshot.platform === "android" && snapshot.action === "download") ||
        (snapshot.platform === "electron" && snapshot.action === "open"));
    const isAutomatic = snapshot.source === "auto";
    if ((!isRestartNotice && !isDownloadNotice) || !snapshot.latestVersion) {
      dismiss(UPDATE_NOTICE_ID_EXPORT);
      return;
    }
    if (isAutomatic && !isAutomaticCheckEnabled()) return;
    if (isAutomatic && isUpdateNoticeSuppressed()) return;

    const versionLabel = snapshot.latestVersion ? `v${snapshot.latestVersion}` : undefined;
    const title = isRestartNotice ? "新版本已下载" : "发现新版本";
    notify({
      id: UPDATE_NOTICE_ID_EXPORT,
      variant: snapshot.minimumVersionWarning ? "warning" : "info",
      className: isDownloadNotice ? `${styles.notice} ${styles.noticeWithAction}` : styles.notice,
      title: versionLabel ? (
        <>
          {title}
          <span className={styles.version}>{versionLabel}</span>
        </>
      ) : (
        title
      ),
      duration: null,
      description: isRestartNotice ? (
        "请重启应用，退出时会自动安装。"
      ) : isDownloadNotice ? (
        <span className={styles.actionRow}>
          <Button
            className={styles.action}
            size="sm"
            variant="minimal"
            onClick={() => {
              void executeUpdateAction();
            }}
          >
            {getDownloadActionLabel(snapshot.platform)}
          </Button>
        </span>
      ) : undefined,
      onDismiss: (reason) => {
        if (reason !== "timeout") dismissUpdateNotice();
      },
    });
  }, [dismiss, notify, snapshot]);

  return null;
}
