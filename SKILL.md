---
name: biliscriptor-product-direction
description: BiliScriptor product direction and scope guidance. Use when deciding feature priority, project positioning, roadmap items, ASR/OCR/frame extraction/LLM boundaries, content archive goals, or whether a change belongs in the project.
---

# BiliScriptor 项目定位与长期方向

## 本 skill 边界

本 skill 负责项目定位、功能优先级、ASR/OCR/抽帧/LLM 边界和长期方向判断。不要在这里记录具体 CLI 参数、manifest 字段、依赖安装或贡献流程；这些内容分别放入 README、architecture、tech-stack 或 development-standards。

## 核心定位

BiliScriptor 是 B 站视频内容的高保真归档工具，不是视频总结器。目标是尽可能完整、准确、可追溯地把视频信息归档为大量文本内容，并在必要时保留少量关键图片证据。

项目默认不下载音视频媒体。播放流候选用于记录可用媒体入口，为后续外部处理流提供基础信息。

## 内容主线

优先增强与视频本体直接相关的数据层：

- 元数据、分 P、章节看点和播放器信息。
- 官方字幕、B 站 AI 字幕、外部 ASR 转写。
- OCR、抽帧、关键帧、画面文字和画面信息提取。
- 内容时间线、来源、时间戳、处理链路、置信度和文件索引。

评论和弹幕是辅助证据层，用于补充语境、观众反馈、争议点和重点验证；它们不能替代视频正文，也不应成为项目主线。

## LLM 使用边界

LLM 可以用于：

- 画面文字或画面内容提取。
- 字幕校对和多来源文本对齐。
- OCR 后处理、去重和结构化抽取。
- 将已提取信息组织为可检索、可追溯的归档结构。

LLM 不应默认用于：

- 生成视频观点总结。
- 生成学习笔记。
- 替用户下结论。
- 补写缺失的原始视频内容。

## 优先级判断

优先做：

- 提高视频内容完整性、可追溯性和机器可消费性的功能。
- 让下游 ASR/OCR/抽帧/关键帧/AI 信息提取更稳定的接口或 schema。
- 更好的阶段恢复、批量处理、状态记录和脱敏排障。

谨慎做：

- 大量评论区分析、弹幕娱乐化展示、泛统计看板。
- 默认媒体下载。
- 无来源或无时间戳的二次创作型输出。

不做或不作为核心：

- 视频摘要应用。
- 学习笔记生成器。
- 观点提炼或立场判断工具。

## 长期方向

- 建立统一内容时间线，把字幕、ASR、OCR、关键帧和画面信息串联起来。
- 定义外部处理流适配约定，先支持可靠落盘与索引，再考虑内置执行。
- 增强批量输入来源，例如收藏夹、合集、UP 主视频列表。
- 支持更完整的互动视频结构归档。
- 保持本地优先和隐私友好，所有敏感信息继续严格脱敏。
