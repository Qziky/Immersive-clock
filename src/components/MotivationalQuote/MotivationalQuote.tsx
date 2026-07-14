import { useAppState } from "../../contexts/AppContext";
import { useComponentAppearance } from "../../contexts/AppearanceContext";
import { useQuoteRotation } from "../../hooks/useQuoteRotation";

import { MotivationalQuotePresentation } from "./MotivationalQuotePresentation";

export function MotivationalQuote() {
  const { quoteChannels, quoteSettings } = useAppState();
  const { quote, isRefreshing, refresh } = useQuoteRotation(quoteChannels.channels, quoteSettings);
  const textAppearance = useComponentAppearance("studyQuote", "text");
  const cursorAppearance = useComponentAppearance("studyQuote", "cursor");

  return (
    <MotivationalQuotePresentation
      animationMode={quoteSettings.animationMode}
      buttonAttributes={{
        "aria-busy": isRefreshing,
        "aria-label": "刷新语录",
        onClick: () => void refresh(),
        title: isRefreshing ? "正在刷新语录" : "点击刷新语录",
      }}
      cursorStyle={cursorAppearance}
      quote={quote}
      textStyle={textAppearance}
      typewriterBackspaceEnabled={quoteSettings.typewriterBackspaceEnabled}
      typingSpeed={quoteSettings.typingSpeed}
    />
  );
}

export default MotivationalQuote;
