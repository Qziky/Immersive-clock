# 环境安静评分 `spectral-activity-v2`

`spectral-activity-v2` 是无设备基线的相对环境活动评分。它只消费会话几何信息和按采样轴排序的
100ms 特征帧，不使用用户校准、不学习长期“安静基线”，也不声称输出专业声压级。

模型版本为 `NOISE_SCORE_MODEL_VERSION = "spectral-activity-v2"`，参数摘要为：

```text
spectral-activity-v2:k0.68:r0.22:e0.78:x0.40:g3:n15:c0.80:f8:s48:w60:u5
```

参数变化必须升级模型版本或摘要并触发重算。

## 1. 帧活动度

对每个有效帧：

```text
K = clamp((AWeighted - P01) / max(RMS - P01, epsilon), 0, 1)
x = clamp((K - 0.68) / 0.22, 0, 1)
frameActivity = x² × (3 - 2x)
```

其中 `RMS`、`AWeighted` 和 `P01` 都是 dBFS。K 表示 A 加权能量在 P1 谷值与原始 RMS 之间的
相对位置，smoothstep 将 0.68–0.90 区间映射为平滑活动度。输入包含非有限值时帧无效；
`RMS - P01 <= epsilon` 时活动度为 0。

## 2. 异常零信号

连续至少 3 秒且 `zeroRatio >= 0.95` 的帧段被排除。连续性按 `startSample` 与 `frameSamples`
判断，不依赖墙钟时间。算法无法可靠区分真实近零信号和系统门限/音频处理，因此统一标记
`signal-anomaly`，不把它当成“绝对安静”。

## 3. 秒级聚合和覆盖率

- 默认每秒期望 10 帧；至少 8 帧才构成有效秒。
- 有效秒活动度为该秒帧活动度中位数。
- 60 秒窗口至少 48 个有效秒，且覆盖率至少 80%，否则 `score = null`。
- 首次必须收集完整 60 秒；此后每 5 秒滚动一次。

覆盖不足时仍输出细节、质量和 signal health，UI 可以显示采集进度，但不能展示临时分数。

## 4. 事件检测

对秒级活动度使用迟滞：

- 活动度 `>= 0.78` 进入事件；
- 连续两秒 `< 0.40` 退出；
- null 秒会终止当前事件；
- 与上个事件间隔不超过 3 秒时合并；
- `eventFactor = clamp(eventCount / 15, 0, 1)`。

事件项用于表达频繁短声；它不试图识别说话、敲击或具体声源。

## 5. 窗口评分

```text
E = mean(valid second activity)
C = P20(valid second activity)
F = min(eventCount / 15, 1)

score = 100 × clamp(1 - 0.65E - 0.25C - 0.10F, 0, 1)
```

代码最终保留一位小数。高分表示过去 60 秒中持续活动、活动底部和事件频率都较低；它是
当前设备与浏览器处理链上的相对环境指标，不是跨设备绝对比较。

## 6. 质量与置信度

| 条件                                       | quality        | confidence |
| ------------------------------------------ | -------------- | ---------- |
| 覆盖不足                                   | `insufficient` | `none`     |
| 系统音频处理未确认关闭或存在 clipped frame | `low`          | `low`      |
| 有帧 `zeroRatio > 0.2`                     | `medium`       | `medium`   |
| 覆盖充足、处理关闭、无上述问题             | `high`         | `high`     |

`signalHealth` 在覆盖不足时为 `insufficient-coverage`；检测到异常零信号或低质量时为
`signal-anomaly`；否则为 `healthy`。track muted、ended 和 AudioContext suspended 由采集健康
监视器在评分外产生。

## 7. 派生记录

每个 `NoiseScoreWindow` 保存：

- schema 和模型版本；
- 会话/Leader/窗口序号；
- 源帧序列、样本和时间范围；
- score、E/C/F、事件数、覆盖率、质量、健康和置信度；
- 可选估算 dB(A) 统计；
- `sourceAvailable` 与特征数量。

记录 ID 由模型、会话和窗口位置稳定生成，重复计算可覆盖。删除派生评分后，只要会话和原始
特征仍在，就能通过后台 Worker 重建。

## 8. dB(A) 估算是独立链路

可信外部校准只计算：

```text
estimatedDbA = aWeightedDbfs + offsetDb
```

它不改变 frameActivity、覆盖率、score、quality 或 confidence。设备/处理签名变化时校准失效；
未校准时 `estimatedDbA = null`。产品与宣传文案必须称“估算 dB(A)”并说明非专业仪器。

## 9. 实时与历史一致性

实时 `NoiseCaptureRuntime` 和历史 `noiseRescoreCore` 必须调用同一个
`computeSpectralActivityScore()`，并使用相同 60 秒窗口、5 秒步长和测试向量。模型发布检查应覆盖：

- 参数摘要和模型版本；
- 非有限值、异常零信号、削波和系统处理状态；
- 48/60 覆盖边界；
- 事件进入/退出/合并；
- Worker 与实时路径结果一致；
- 重算幂等、暂停续跑和旧模型清理。
