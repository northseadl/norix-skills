> API: https://open.feishu.cn/document/server-docs/docs/drive-v1/file/copy

# 复制文件
将用户云空间中的文件复制至其它文件夹下。该接口为异步接口。
## 使用限制
  * 不支持复制文件夹。
  * 云空间中文件夹（包括根文件夹，即根目录）的单层节点上限为 1500 个。超过此限制时，接口将返回 1062507 错误码。可通过将文件复制到不同文件夹中解决。
  * 云空间中所有层级的节点总和的上限为 40 万个。
  * 该接口不支持并发调用，且调用频率上限为 5QPS 且 10000次/天。否则会返回 1061045 错误码，可通过稍后重试解决。


## 请求
HTTP URL | https://open.feishu.cn/open-apis/drive/v1/files/:file_token/copy  
---|---  
HTTP Method | POST  
接口频率限制 |   
支持的应用类型 |  自建应用 商店应用  
权限要求 开启任一权限即可 |  复制云文档 查看、评论、编辑和管理云空间中所有文件  
字段权限要求 |  该接口返回体中存在下列敏感字段，仅当开启对应的权限后才会返回；如果无需获取这些字段，则不建议申请 获取用户 user ID 仅自建应用  
### 请求头
名称 | 类型 | 必填 | 描述  
---|---|---|---  
Authorization | string |  应用调用 API 时，需要通过访问凭证（access_token）进行身份鉴权，不同类型的访问凭证可获取的数据范围不同，参考 [选择并获取访问凭证](https://open.feishu.cn/document/ukTMukTMukTM/uMTNz4yM1MjLzUzM) 。 **值格式** ："Bearer `access_token`" **可选值如下** ： tenant_access_token 以应用身份调用 API，可读写的数据范围由应用自身的 [数据权限范围](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions)决定。参考 [自建应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token_internal) 或 [商店应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token) 。示例值："Bearer t-g1044qeGEDXTB6NDJOGV4JQCYDGHRBARFTGT1234" user_access_token 以登录用户身份调用 API，可读写的数据范围由用户可读写的数据范围决定。参考 [获取 user_access_token](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token)。示例值："Bearer u-cjz1eKCEx289x1TXEiQJqAh5171B4gDHPq00l0GE1234"  
Content-Type | string | **固定值** ："application/json; charset=utf-8"  
### 路径参数  
file_token | string |  被复制的源文件的 token。了解如何获取文件 token，参考[文件概述](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/file-overview)。 **示例值** ："doccngpahSdXrFPIBD4XdIabcef"  
### 查询参数  
user_id_type | string |  用户 ID 类型 **示例值** ："open_id" **可选值有** ：
  * `open_id`：标识一个用户在某个应用中的身份。同一个用户在不同应用中的 Open ID 不同。[了解更多：如何获取 Open ID](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-obtain-openid)
  * `union_id`：标识一个用户在某个应用开发商下的身份。同一用户在同一开发商下的应用中的 Union ID 是相同的，在不同开发商下的应用中的 Union ID 是不同的。通过 Union ID，应用开发商可以把同个用户在多个应用中的身份关联起来。[了解更多：如何获取 Union ID？](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-obtain-union-id)
  * `user_id`：标识一个用户在某个租户内的身份。同一个用户在租户 A 和租户 B 内的 User ID 是不同的。在同一个租户内，一个用户的 User ID 在所有应用（包括商店应用）中都保持一致。User ID 主要用于在不同的应用间打通用户数据。[了解更多：如何获取 User ID？](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-obtain-user-id)

**默认值** ：`open_id` **当值为`user_id` ，字段权限要求**： 获取用户 user ID 仅自建应用  
### 请求体
名称 展开子列表  
---  
name | string |  复制的新文件的名称 **数据校验规则** ：最大长度为 `256` 字节 **示例值** ："Demo copy"  
type | string |  被复制的源文件的类型。必须与 `file_token` 对应的源文件实际类型一致。 **注意** ：该参数为必填，请忽略左侧必填列的“否”。若该参数值为空或与实际文件类型不匹配，接口将返回失败。 **示例值** ："docx" **可选值有** ：
  * `file`：文件类型
  * `doc`：旧版文档。了解更多，参考[新旧版本文档说明](https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/docs/upgraded-docs-access-guide/upgraded-docs-openapi-access-guide)。
  * `sheet`：电子表格类型
  * `bitable`：多维表格类型
  * `docx`：新版文档类型

  
folder_token | string |  目标文件夹的 token。若传入根文件夹 token，表示复制的新文件将被创建在云空间根目录。了解如何获取文件夹 token，参考[文件夹概述](https://open.feishu.cn/document/ukTMukTMukTM/ugTNzUjL4UzM14CO1MTN/folder-overview)。 **示例值** ："fldbcO1UuPz8VwnpPx5a92abcef"  
extra | property[] | 自定义请求附加参数，用于实现特殊的复制语义  
### 请求示例
以下为固定的代码示例。如需根据实际场景调整请求参数，可打开 APl 调试台 输入参数后生成相应的示例代码 操作指引
curl-i-X POST 'https://open.
feishu.cn/open-apis/drive/v1/
files/
doccngpahSdXrFPIBD4XdIabcef/copy?
user_id_type=open_id' \
-H 'Authorization: Bearer 
t-7f1b******8e560' \
-H 'Content-Type: application/
json' \
"folder_token": 
"fldbcO1UuPz8VwnpPx5a92abcef",
"name": "Demo copy",
"type": "file"
## 响应
### 响应体
名称 展开子列表  
---  
code | int | 错误码，非 0 表示失败  
msg | string | 错误描述  
data  
### 响应体示例
"code": 0,
"data": {
"file": {
"name": "Demo copy",
"parent_token": "fldcnBh8LrnX42dr1pBYclabcef",
"token": "doxcnUkUOWtOelpFcha2Z9abcef",
"type": "docx",
"url": "https://feishu.cn/docx/doxcnUkUOWtOelpFcha2Zabcef"
"msg": "success"
### 错误码
HTTP状态码 | 错误码 | 描述 | 排查建议  
---|---|---|---  
500 | 1061001 | internal error. | 服务内部错误，包括超时，错误码没处理。请联系[技术支持](https://applink.larkoffice.com/TLJpeNdW)。  
400 | 1061002 | params error. | 资源不存在。请确认对应资源是否存在。  
404 | 1061003 | not found. | 请确认对应资源是否存在。  
403 | 1061004 | forbidden. |  当前调用身份没有文件或文件夹的阅读或编辑等权限。请参考以下方式解决：
  * 若上传素材，请确保当前调用身份具有目标云文档的编辑权限
  * 若上传文件，请确保当前调用身份具有文件夹的编辑权限
  * 若对文件或文件夹进行增删改等操作，请确保调用身份具有足够文档权限：
    * 对于新建文件接口，调用身份需要有目标文件夹的编辑权限
    * 对于复制文件接口，调用身份需要有文件的阅读或编辑权限、并且具有目标文件夹的编辑权限
    * 对于移动文件接口，调用身份需要有被移动文件的可管理权限、被移动文件所在位置的编辑权限、目标位置的编辑权限
    * 对于删除文件接口，调用身份需要具有以下两种权限之一：
      * 该应用或用户是文件所有者并且具有该文件所在父文件夹的编辑权限
      * 该应用或用户并非文件所有者，但是该文件所在父文件夹的所有者或者拥有该父文件夹的所有权限（full access）

了解开通权限步骤，参考[如何为应用开通云文档相关资源的权限](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-add-permissions-to-app)。  
401 | 1061005 | auth failed. | 请检查 access token 是否有效，使用正确身份访问该接口。  
404 | 1061007 | file has been delete. | 文件已被删除。请确认对应节点未被删除。  
400 | 1061045 | can retry. | 内部可重试错误，请稍后重试。  
400 | 1062507 | parent node out of sibling num. |  云空间中文件夹（包括根文件夹，即根目录）的单层节点超限。上限为 1500 个，你可通过将文件新建到不同文件夹中解决。参考以下方式获取文件夹 token：
  * 调用[获取我的空间（root folder）元数据](https://open.feishu.cn/document/ukTMukTMukTM/ugTNzUjL4UzM14CO1MTN/get-root-folder-meta)接口获取根目录（即根文件夹）的 token
  * 继续调用[获取文件夹中的文件清单](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/list)接口，获取根目录下文件夹的 token

  
403 | 1064510 | cross tenant and unit not support. | 不支持跨租户跨地域的请求。  
403 | 1064511 | cross brand not support. | 不支持跨品牌的请求。  
相关问题
[如何解决 tenant token invalid (99991663) 错误？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-fix-99991663-error)
[如何选择不同类型的 access token？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-choose-which-type-of-token-to-use)
遇到其他问题？问问 开放平台智能助手
