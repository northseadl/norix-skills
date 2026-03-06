> API: https://open.feishu.cn/document/server-docs/docs/drive-v1/file/get

# 获取文件统计信息
此接口用于获取各类文件的流量统计信息和互动信息，包括阅读人数、阅读次数和点赞数。
## 请求
HTTP URL | https://open.feishu.cn/open-apis/drive/v1/files/:file_token/statistics  
---|---  
HTTP Method | GET  
接口频率限制 |   
支持的应用类型 |  自建应用 商店应用  
权限要求 开启任一权限即可 |  查看、评论、编辑和管理云空间中所有文件 查看云空间中文件元数据 查看、评论和下载云空间中所有文件  
### 请求头
名称 | 类型 | 必填 | 描述  
---|---|---|---  
Authorization | string |  应用调用 API 时，需要通过访问凭证（access_token）进行身份鉴权，不同类型的访问凭证可获取的数据范围不同，参考 [选择并获取访问凭证](https://open.feishu.cn/document/ukTMukTMukTM/uMTNz4yM1MjLzUzM) 。 **值格式** ："Bearer `access_token`" **可选值如下** ： tenant_access_token 以应用身份调用 API，可读写的数据范围由应用自身的 [数据权限范围](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions)决定。参考 [自建应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token_internal) 或 [商店应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token) 。示例值："Bearer t-g1044qeGEDXTB6NDJOGV4JQCYDGHRBARFTGT1234" user_access_token 以登录用户身份调用 API，可读写的数据范围由用户可读写的数据范围决定。参考 [获取 user_access_token](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token)。示例值："Bearer u-cjz1eKCEx289x1TXEiQJqAh5171B4gDHPq00l0GE1234"  
Content-Type | string | **固定值** ："application/json; charset=utf-8"  
更多云文档接口权限问题，参考[常见问题](https://open.feishu.cn/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN)。
### 路径参数  
file_token | string |  文件 token。了解如何获取文件 token，参考[文件概述](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/file-overview)。 **示例值** ："doccnfYZzTlvXqZIGTdAHKabcef"  
### 查询参数  
file_type | string |  文件类型 **示例值** ："doc" **可选值有** ：
  * `doc`：旧版文档
  * `sheet`：电子表格
  * `mindnote`：思维笔记
  * `bitable`：多维表格
  * `wiki`：知识库文档

  
### 请求示例
以下为固定的代码示例。如需根据实际场景调整请求参数，可打开 APl 调试台 输入参数后生成相应的示例代码 操作指引
curl-i-XGET'https://open.
feishu.cn/open-apis/drive/v1/
files/
doccnfYZzTlvXqZIGTdAHKabcef/
statistics?file_type=doc' \
-H 'Authorization: Bearer 
t-7f1b******8e560'
## 响应
### 响应体
名称 展开子列表  
---  
code | int | 错误码，非 0 表示失败  
msg | string | 错误描述  
data  
### 响应体示例
"code": 0,
"msg": "success",
"data": {
"file_token": "doccnfYZzTlvXqZIGTdAHKabcef",
"file_type": "doc",
"statistics": {
"uv": 10,
"pv": 15,
"like_count": 2,
"timestamp": 1627367349,
"uv_today": 1,
"pv_today": 1,
"like_count_today": 1
### 错误码
HTTP状态码 | 错误码 | 描述 | 排查建议  
---|---|---|---  
500 | 1069601 | fail | 重试，若稳定失败请联系相关业务方 oncall 人员  
400 | 1069602 | param error | 检查参数有效性  
403 | 1069603 | forbidden |  无权限操作，可能是如下原因：
  * 调用身份无文档管理权限
  * 当前租户未开启文档访问记录功能

请参考以下方式为调用身份开通文档管理权限：
  * 如果你使用的是 `tenant_access_token`，意味着当前应用没有云文档权限。你需通过云文档网页页面右上方 **「...」** -> **「...更多」** ->**「添加文档应用」** 入口为应用添加管理权限。 **注意** ：在 **添加文档应用** 前，你需确保目标应用至少开通了一个云文档或多维表格的 [API 权限](https://open.feishu.cn/document/ukTMukTMukTM/uYTM5UjL2ETO14iNxkTN/scope-list)。否则你将无法在文档应用窗口搜索到目标应用。
  * 如果你使用的是 `user_access_token`，意味着当前用户没有云文档权限。你需通过云文档网页页面右上方 **分享** 入口为当前用户添加管理权限。

了解具体操作步骤或其它添加权限方式，参考[云文档常见问题 3](https://open.feishu.cn/document/ukTMukTMukTM/uczNzUjL3czM14yN3MTN#16c6475a)。  
400 | 1069604 | document not found | 检查文档是否存在  
相关问题
[如何解决 tenant token invalid (99991663) 错误？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-fix-99991663-error)
[如何选择不同类型的 access token？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-choose-which-type-of-token-to-use)
遇到其他问题？问问 开放平台智能助手
