// 应用版本号与构建元信息。所有数字必须与 package.json 的 version 字段保持一致。
// 修改流程:先 bump 全部 package.json(version)及 workspace 依赖版本,再更新本文件,最后在 CHANGELOG.md
// 顶部追加版本条目。
import packageInfo from "../../../../package.json" with { type: "json" };

export const APP_VERSION: string = packageInfo.version;
export const APP_NAME: string = packageInfo.name;
export const VERSION_RELEASE_DATE = "2026-06-30";
