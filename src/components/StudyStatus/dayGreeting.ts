export interface DayGreeting {
  ariaText: string;
  text: string;
}

export function getDayGreeting(now: Date): DayGreeting {
  const hour = now.getHours();

  if (hour < 5) return { ariaText: "凌晨啦", text: "凌晨啦 (－_－) zZ" };
  if (hour < 8) return { ariaText: "早安呀", text: "早安呀 (｡･ω･｡)ﾉ" };
  if (hour < 11) return { ariaText: "上午好", text: "上午好 (•̀ᴗ•́)و" };
  if (hour < 14) return { ariaText: "中午好", text: "中午好 (｡•ㅅ•｡)" };
  if (hour < 18) return { ariaText: "下午好", text: "下午好 (ง •̀_•́)ง" };
  if (hour < 22) return { ariaText: "晚上好", text: "晚上好 (´▽｀)ノ♪" };
  return { ariaText: "夜深啦", text: "夜深啦 (。-ω-)zzz" };
}
