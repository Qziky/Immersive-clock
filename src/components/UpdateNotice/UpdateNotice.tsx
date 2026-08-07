import { useEffect } from "react";

import { useUpdateSnapshot } from "../../hooks/useUpdateRuntime";
import {
  checkForUpdates,
  dismissUpdateNotice,
  executeUpdateAction,
  isAutomaticCheckEnabled,
  isUpdateNoticeSuppressed,
  startUpdateRuntime,
  UPDATE_NOTICE_ID_EXPORT,
} from "../../services/update/updateRuntime";
import { Button, useFeedback } from "../../ui";

import styles from "./UpdateNotice.module.css";

function getActionLabel(status: string, action: string | undefined, platform: string): string {
  if (action === "retry") return status === "available" ? "重试准备" : "重试";
  if (action === "open") return platform === "electron" ? "发布页" : "下载";
  if (status === "ready") return platform === "electron" ? "重启安装" : "更新";
  if (status === "downloading") return "下载中";
  if (status === "error") return "重试";
  if (platform === "android" || platform === "electron") return "下载";
  return "更新";
}

export function UpdateNotice() {
  const snapshot = useUpdateSnapshot();
  const { dismiss, notify } = useFeedback();

  useEffect(() => startUpdateRuntime(), []);

  useEffect(() => {
    const isUpdateState = ["available", "downloading", "ready", "error"].includes(snapshot.status);
    const isAutomatic = snapshot.source === "auto";
    if (!isUpdateState || (snapshot.status !== "error" && !snapshot.latestVersion)) {
      if (snapshot.status === "current") dismiss(UPDATE_NOTICE_ID_EXPORT);
      return;
    }
    if (isAutomatic && !isAutomaticCheckEnabled()) return;
    if (isAutomatic && snapshot.status !== "error" && isUpdateNoticeSuppressed()) return;
    if (snapshot.status === "error" && snapshot.source !== "manual") return;

    const action =
      snapshot.status === "downloading"
        ? undefined
        : snapshot.status === "error"
          ? "retry"
          : snapshot.action;
    const versionLabel = snapshot.latestVersion ? `v${snapshot.latestVersion}` : undefined;
    const title =
      snapshot.status === "error"
        ? "更新检查失败"
        : snapshot.action === "retry"
          ? "资源准备中"
          : snapshot.status === "downloading"
            ? "正在下载"
            : snapshot.status === "ready"
              ? "更新已就绪"
              : snapshot.latestVersion
                ? "发现新版本"
                : "应用更新已就绪";
    notify({
      id: UPDATE_NOTICE_ID_EXPORT,
      variant: snapshot.minimumVersionWarning ? "warning" : "info",
      className: action ? `${styles.notice} ${styles.noticeWithAction}` : styles.notice,
      title: versionLabel ? (
        <>
          {title}
          <span className={styles.version}>{versionLabel}</span>
        </>
      ) : (
        title
      ),
      duration: null,
      description: action ? (
        <span className={styles.actionRow}>
          <Button
            className={styles.action}
            size="sm"
            variant="minimal"
            onClick={() => {
              if (action === "retry") {
                void checkForUpdates({ manual: true });
              } else {
                void executeUpdateAction();
              }
            }}
          >
            {getActionLabel(snapshot.status, action, snapshot.platform)}
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
