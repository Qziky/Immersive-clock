# Third-Party Notices

Immersive Clock 的项目代码按 [GPL-3.0-only](LICENSE) 发布。本文件所列的第三方组件和素材
仍按其各自许可证使用，不会因为被本项目引用或随发行物分发而自动改用 GPL。

## 自托管字体

### Inter

- 文件：`public/fonts/inter/*.woff2`
- 版权：Copyright (c) 2016 The Inter Project Authors
- 许可证：SIL Open Font License 1.1
- 来源：[rsms/inter](https://github.com/rsms/inter)
- 完整许可证：[LICENSES/Inter-OFL-1.1.txt](LICENSES/Inter-OFL-1.1.txt)

### Roboto Mono

- 文件：`public/fonts/roboto-mono/*.woff2`
- 版权：Copyright 2015 The Roboto Mono Project Authors
- 许可证：SIL Open Font License 1.1
- 来源：[googlefonts/RobotoMono](https://github.com/googlefonts/RobotoMono)
- 完整许可证：[LICENSES/RobotoMono-OFL-1.1.txt](LICENSES/RobotoMono-OFL-1.1.txt)

## 天气图标

- 文件：`public/weather-icons/**/*.svg`
- 来源：Meteocons v2.0.0，文件内容与上游 `production/fill/all` 和 `production/line/all`
  中对应图标一致。
- 版权：Copyright (c) 2020–2021 Bas Milius
- 许可证：MIT
- 来源：[basmilius/meteocons](https://github.com/basmilius/meteocons/tree/v2.0.0)
- 完整许可证：[LICENSES/Meteocons-MIT.txt](LICENSES/Meteocons-MIT.txt)

## npm 依赖

直接依赖和传递依赖的精确版本记录在 [package-lock.json](package-lock.json)。生产构建会
根据已安装的生产依赖生成 `LICENSES/npm-production-dependencies.txt`，其中包含包名、版本、
许可证表达式以及可找到的上游许可证/版权文本。发布 Web、Android 或 Electron 构建产物时，
请保留该文件以及本目录中的其他许可证文件。
