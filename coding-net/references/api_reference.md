# Coding.net Open API Reference

> Quick reference for Action parameters. For full OpenAPI spec: https://coding.net/help/openapi
>
> ⚠️ Parameters marked with ✗ have been verified as non-functional in live testing.
> Parameters marked with ✓ are verified working.

## API Protocol

All requests use the same pattern:

```
POST https://{team}.coding.net/open-api?Action={ActionName}
Authorization: Bearer {personal_access_token}
Content-Type: application/json

{...request body...}
```

Response envelope:
```json
{
  "Response": {
    "RequestId": "uuid",
    ...data fields...
  }
}
```

Error envelope:
```json
{
  "Response": {
    "RequestId": "uuid",
    "Error": {
      "Code": "ErrorCode",
      "Message": "Error description"
    }
  }
}
```

---

## 代码托管相关接口

### DescribeProjectDepots — 获取项目仓库列表

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| DepotType | string | ✓ | 仓库类型: CODING / GITHUB / GITLAB / ... |

**Response**: `Data.DepotList[]` — Id, Name, DepotType, DepotSshUrl, DepotHttpsUrl, IsDefault

### DescribeGitBranches — 分支列表 ✓

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| KeyWord | string | | 搜索关键词 |

**Response**: `Branches[]` — BranchName, IsDefaultBranch, IsProtected, Sha, LastCommitDate

> ~~DescribeProjectDepotBranches~~ (ProjectName + DepotName) — 实测不可用，请用 DescribeGitBranches

### DescribeGitTags — 标签列表 ✓

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |

> ~~DescribeProjectDepotTags~~ — 实测不可用

### DescribeGitCommits — 提交记录 ✓

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| Ref | string | | 分支/标签 |
| PageSize | int | | 每页数量 |
| PageNumber | int | | 页码 |

**Response**: `Commits[]` — ShortMessage, Sha, CommitDate, Committer, FullMessage

> ~~DescribeProjectDepotCommits~~ — 实测不可用

### DescribeGitCommitInfo — 提交详情

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| Sha | string | ✓ | Commit SHA |

### DescribeGitTree — 文件树

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| Path | string | ✓ | 路径 |
| Ref | string | ✓ | 分支/标签 |

### DescribeGitFileContent — 文件内容

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| Path | string | ✓ | 文件路径 |
| Ref | string | ✓ | 分支/标签 |

### CreateGitBranch — 创建分支

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| BranchName | string | ✓ | 新分支名 |
| StartPoint | string | ✓ | 起始点 (分支/Tag/SHA) |

### DeleteGitBranch — 删除分支

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| BranchName | string | ✓ | 分支名 |

### CreateGitMergeRequest — 创建合并请求 ✓

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| SrcBranch | string | ✓ | 源分支 |
| DestBranch | string | ✓ | 目标分支 |
| Title | string | ✓ | 标题 |
| Content | string | | 描述 |
| ReviewerIds | int[] | | 评审人 ID 列表 |

> ⚠️ 参数名是 `SrcBranch`/`DestBranch`（非 SourceBranch/TargetBranch）

### ModifyGitFiles — 通过 API 提交文件 ✓

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| Ref | string | ✓ | 目标分支 |
| Message | string | ✓ | 提交信息 |
| GitFiles | array | ✓ | 文件操作列表 |

GitFiles 元素结构:
| Field | Type | Description |
|---|---|---|
| Path | string | 文件路径 |
| Content | string | Base64 编码的文件内容 |
| Op | string | 操作: createFile / updateFile / deleteFile |

### DescribeProjectMergeRequests — 合并请求列表

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectName | string | ✓ | 项目名称 |
| DepotName | string | | 仓库名称 |
| Status | string | | 状态: open/closed/merged |
| PageNumber | int | | 页码 |
| PageSize | int | | 每页数量 |

### DescribeMergeRequest — 合并请求详情

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| IId | int | ✓ | MR 编号 |

### ModifyMergeMR — 执行合并

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| MergeId | int | ✓ | MR ID |
| CommitMessage | string | | 提交信息 |
| DeleteSourceBranch | bool | | 合并后删除源分支 |

### ModifyCloseMR — 关闭合并请求

| Parameter | Type | Required | Description |
|---|---|---|---|
| DepotId | int | ✓ | 仓库 ID |
| MergeId | int | ✓ | MR ID |

---

## 持续集成相关接口

### DescribeCodingCIJobs — CI 任务列表

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| DepotId | int | | 仓库 ID 过滤 |
| PageSize | int | | 每页数量 |
| PageNumber | int | | 页码 |

### DescribeCodingCIJob — CI 任务详情

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| Id | int | ✓ | CI Job ID |

### TriggerCodingCIBuild — 触发构建

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| JobId | int | ✓ | CI Job ID |
| Ref | string | | Git ref (branch/tag) |
| EnvParams | object | | 环境变量参数 |

### DescribeCodingCIBuilds — 构建记录列表

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| JobId | int | ✓ | CI Job ID |
| PageSize | int | | 每页数量 |
| PageNumber | int | | 页码 |

### DescribeCodingCIBuild — 构建详情

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| BuildId | int | ✓ | 构建 ID |

### DescribeCodingCIBuildStage — 构建阶段

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| BuildId | int | ✓ | 构建 ID |

### DescribeCodingCIBuildLog — 构建日志

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| BuildId | int | ✓ | 构建 ID |

### DescribeCodingCIBuildLogRaw — 构建原始日志

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| BuildId | int | ✓ | 构建 ID |

### DescribeCodingCIBuildStepLog — 步骤日志

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| BuildId | int | ✓ | 构建 ID |
| StepId | int | ✓ | 步骤 ID |

### StopCodingCIBuild — 停止构建

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| BuildId | int | ✓ | 构建 ID |

### DescribeCodingCIBuildMetrics — 构建指标

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| BuildId | int | ✓ | 构建 ID |

### DescribeCodingCIBuildStatistics — 构建统计

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| JobId | int | ✓ | CI Job ID |

---

## 制品仓库相关接口

### DescribeArtifactRepositoryList — 制品仓库列表

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| Type | string | | 类型过滤: docker/maven/npm/... |
| PageSize | int | | 每页数量 |
| PageNumber | int | | 页码 |

### CreateArtifactRepository — 创建制品仓库

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| Name | string | ✓ | 仓库名称 |
| Type | string | ✓ | 类型: docker/maven/npm/pypi/helm/generic/composer |
| Description | string | | 描述 |

### DescribeArtifactPackageList — 包列表

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| Repository | string | ✓ | 仓库名称 |
| PageSize | int | | 每页数量 |
| PageNumber | int | | 页码 |

### DescribeArtifactVersionList — 版本列表

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| Repository | string | ✓ | 仓库名称 |
| Package | string | ✓ | 包名 |
| PageSize | int | | 每页数量 |
| PageNumber | int | | 页码 |

### DescribeArtifactFileDownloadUrl — 获取下载地址

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| Repository | string | ✓ | 仓库名称 |
| Package | string | ✓ | 包名 |
| Version | string | ✓ | 版本号 |

### DescribeArtifactProperties — 属性查询

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| Repository | string | ✓ | 仓库名称 |
| Package | string | ✓ | 包名 |
| Version | string | ✓ | 版本号 |

### CreateArtifactProperties — 设置属性

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| Repository | string | ✓ | 仓库名称 |
| Package | string | ✓ | 包名 |
| Version | string | ✓ | 版本号 |
| PropertyName | string | ✓ | 属性名 |
| PropertyValue | string | ✓ | 属性值 |

### ReleaseArtifactVersion — 发布版本

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| Repository | string | ✓ | 仓库名称 |
| Package | string | ✓ | 包名 |
| Version | string | ✓ | 版本号 |

### ForbiddenArtifactVersion — 禁用版本

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectId | int | ✓ | 项目 ID |
| Repository | string | ✓ | 仓库名称 |
| Package | string | ✓ | 包名 |
| Version | string | ✓ | 版本号 |

---

## 辅助接口

### DescribeCodingProjects — 项目列表

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectName | string | | 项目名称过滤 |
| PageNumber | int | ✓ | 页码 |
| PageSize | int | ✓ | 每页数量 |

### DescribeProjectByName — 按名称查项目

| Parameter | Type | Required | Description |
|---|---|---|---|
| ProjectName | string | ✓ | 项目名称 |

### DescribeCodingCurrentUser — 当前用户

无参数，返回当前认证用户的信息。

### DescribeTeam — 团队信息

无参数，返回当前团队的信息。
