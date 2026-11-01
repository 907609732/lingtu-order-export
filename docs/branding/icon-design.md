# 灵兔订单导出图标

采用新版灵兔蓝青渐变和跃兔形象，结合文档轮廓、导出箭头。小图标去掉文字，避免桌面和任务栏缩小后难以识别。

- build/icon-source.png：透明 PNG 母版。
- build/icon.png：512px 应用窗口图标。
- build/icon.ico：16、24、32、48、64、128、256px Windows 图标，用于 EXE、安装包与快捷方式。
- src/renderer/src/assets/logo-icon.png：与窗口图标一致的软件内标识。
- src/renderer/src/assets/logo.png：用户提供的新版灵兔品牌完整 Logo。

母版由内置 image_gen 根据用户参考图生成；尺寸适配及 ICO 封装采用 MIT 开源工具 [png-to-ico](https://github.com/steambap/png-to-ico)，保留透明通道。未改变业务逻辑、用户数据、版本号或官网。已发布安装包不会因源码资源变化自动更新，安装版需要后续重新构建发布。
