import { useEffect, useState } from "react";

import { Button, FormSection, InfoPanel, Inline, SettingItem, Stack } from "../../../ui";
import { getAppSettings, updateGeneralSettings } from "../../../utils/appSettings";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  formatShortcut,
  isShortcutCode,
  normalizeKeyboardShortcuts,
  type ShortcutAction,
} from "../../../utils/keyboardShortcuts";

interface KeyboardShortcutsPanelProps {
  hidden: boolean | undefined;
  onRegisterSave: (save: () => void) => void;
}

export function KeyboardShortcutsPanel({ hidden, onRegisterSave }: KeyboardShortcutsPanelProps) {
  const [draft, setDraft] = useState(() =>
    normalizeKeyboardShortcuts(getAppSettings().general.keyboardShortcuts)
  );
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<{
    action: ShortcutAction;
    previous: ShortcutAction;
    code: string;
  } | null>(null);

  useEffect(() => {
    onRegisterSave(() => updateGeneralSettings({ keyboardShortcuts: draft }));
  }, [draft, onRegisterSave]);

  useEffect(() => {
    setRecording(null);
    setConflict(null);
  }, [hidden]);

  useEffect(() => {
    if (!recording || hidden) return;
    const capture = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        setRecording(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(null);
        setMessage("");
        return;
      }
      if (event.repeat || event.isComposing || event.keyCode === 229) return;
      if (
        !isShortcutCode(event.code) ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        setMessage("请按一个字母、数字或空格，Esc 取消录入。Enter 和 Esc 保留原有操作。");
        return;
      }
      const previous = SHORTCUT_ACTIONS.find(
        (action) => action !== recording && draft[action] === event.code
      );
      if (previous) {
        setConflict({ action: recording, previous, code: event.code });
      } else {
        setDraft((current) => ({ ...current, [recording]: event.code }));
        setMessage("");
      }
      setRecording(null);
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [recording, hidden, draft]);

  return (
    <FormSection
      title="快捷键"
      variant="plain"
      hidden={hidden}
      description="点击按键后，按一个字母、数字或空格来修改。保存后生效，仅控制当前显示的页面。"
    >
      <Stack gap="md">
        {SHORTCUT_ACTIONS.map((action) => (
          <SettingItem
            key={action}
            title={SHORTCUT_LABELS[action]}
            description={
              action === "toggleTimer"
                ? "倒计时和秒表共用，输入和操作其他控件时暂不触发。"
                : action === "resetCountdown"
                  ? "2 秒内松开再按一次，恢复设定时长并停止。长按只算一次。"
                  : "各主界面共用，Esc 退出全屏。"
            }
            control={
              <Inline gap="sm">
                <Button
                  aria-label={`修改${SHORTCUT_LABELS[action]}快捷键`}
                  aria-pressed={recording === action}
                  onClick={() => {
                    setRecording(action);
                    setConflict(null);
                    setMessage("");
                  }}
                >
                  {recording === action ? "请按键…" : formatShortcut(draft[action])}
                </Button>
                <Button
                  variant="text"
                  disabled={draft[action] === null}
                  aria-label={`清除${SHORTCUT_LABELS[action]}快捷键`}
                  onClick={() => {
                    setDraft((current) => ({ ...current, [action]: null }));
                    setRecording(null);
                    setConflict(null);
                  }}
                >
                  清除
                </Button>
              </Inline>
            }
          />
        ))}
        {recording && (
          <InfoPanel tone="info" role="status">
            请按一个字母、数字或空格，Esc 取消录入。
          </InfoPanel>
        )}
        {message && (
          <InfoPanel tone="warning" role="status">
            {message}
          </InfoPanel>
        )}
        {conflict && (
          <InfoPanel tone="warning" role="alert" title="按键已被占用">
            <Stack gap="sm">
              <span>
                {formatShortcut(conflict.code)} 已用于“{SHORTCUT_LABELS[conflict.previous]}
                ”，是否改为“{SHORTCUT_LABELS[conflict.action]}”？
              </span>
              <Inline gap="sm">
                <Button
                  onClick={() => {
                    setDraft((current) => ({
                      ...current,
                      [conflict.previous]: null,
                      [conflict.action]: conflict.code,
                    }));
                    setConflict(null);
                  }}
                >
                  替换绑定
                </Button>
                <Button variant="text" onClick={() => setConflict(null)}>
                  保留原设置
                </Button>
              </Inline>
            </Stack>
          </InfoPanel>
        )}
        <Button
          variant="text"
          onClick={() => {
            setDraft({ ...DEFAULT_KEYBOARD_SHORTCUTS });
            setRecording(null);
            setConflict(null);
            setMessage("");
          }}
        >
          恢复默认快捷键
        </Button>
      </Stack>
    </FormSection>
  );
}
