> API: https://open.feishu.cn/document/server-docs/docs/drive-v1/file/create_shortcut

# 创建文件快捷方式
创建指定文件的快捷方式到云空间的其它文件夹中。
## 使用限制
该接口不支持并发调用，且调用频率上限为 5 QPS，10000 次/天。否则会返回 1061045 错误码，可通过稍后重试解决。
## 请求
HTTP URL | https://open.feishu.cn/open-apis/drive/v1/files/create_shortcut  
---|---  
HTTP Method | POST  
接口频率限制 |   
支持的应用类型 |  自建应用 商店应用  
权限要求 开启任一权限即可 |  查看、评论、编辑和管理云空间中所有文件 创建云文档的快捷方式  
字段权限要求 |  该接口返回体中存在下列敏感字段，仅当开启对应的权限后才会返回；如果无需获取这些字段，则不建议申请 获取用户 user ID 仅自建应用  
### 请求头
名称 | 类型 | 必填 | 描述  
---|---|---|---  
Authorization | string |  应用调用 API 时，需要通过访问凭证（access_token）进行身份鉴权，不同类型的访问凭证可获取的数据范围不同，参考 [选择并获取访问凭证](https://open.feishu.cn/document/ukTMukTMukTM/uMTNz4yM1MjLzUzM) 。 **值格式** ："Bearer `access_token`" **可选值如下** ： tenant_access_token 以应用身份调用 API，可读写的数据范围由应用自身的 [数据权限范围](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions)决定。参考 [自建应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token_internal) 或 [商店应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token) 。示例值："Bearer t-g1044qeGEDXTB6NDJOGV4JQCYDGHRBARFTGT1234" user_access_token 以登录用户身份调用 API，可读写的数据范围由用户可读写的数据范围决定。参考 [获取 user_access_token](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token)。示例值："Bearer u-cjz1eKCEx289x1TXEiQJqAh5171B4gDHPq00l0GE1234"  
Content-Type | string | **固定值** ："application/json; charset=utf-8"  
### 查询参数  
user_id_type | string |  用户 ID 类型 **示例值** ："open_id" **可选值有** ：
  * `open_id`：标识一个用户在某个应用中的身份。同一个用户在不同应用中的 Open ID 不同。[了解更多：如何获取 Open ID](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-obtain-openid)
  * `union_id`：标识一个用户在某个应用开发商下的身份。同一用户在同一开发商下的应用中的 Union ID 是相同的，在不同开发商下的应用中的 Union ID 是不同的。通过 Union ID，应用开发商可以把同个用户在多个应用中的身份关联起来。[了解更多：如何获取 Union ID？](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-obtain-union-id)
  * `user_id`：标识一个用户在某个租户内的身份。同一个用户在租户 A 和租户 B 内的 User ID 是不同的。在同一个租户内，一个用户的 User ID 在所有应用（包括商店应用）中都保持一致。User ID 主要用于在不同的应用间打通用户数据。[了解更多：如何获取 User ID？](https://open.feishu.cn/document/uAjLw4CM/ugTN1YjL4UTN24CO1UjN/trouble-shooting/how-to-obtain-user-id)

**默认值** ：`open_id` **当值为`user_id` ，字段权限要求**： 获取用户 user ID 仅自建应用  
### 请求体
名称 展开子列表  
---  
parent_token | string |  目标父文件夹的 token，获取方式见[文件夹概述](https://open.feishu.cn/document/ukTMukTMukTM/ugTNzUjL4UzM14CO1MTN/folder-overview) **示例值** ："fldbc5qgwyQnO0uedNllWuabcef"  
refer_entity | refer_entity | 源文件的信息  
### 请求示例
以下为固定的代码示例。如需根据实际场景调整请求参数，可打开 APl 调试台 输入参数后生成相应的示例代码 操作指引
curl-i-X POST 'https://open.
feishu.cn/open-apis/drive/v1/
files/create_shortcut?
user_id_type=open_id' \
-H 'Authorization: Bearer 
t-7f1b******8e560' \
-H 'Content-Type: application/
json' \
"parent_token": 
"fldbc5qgwyQnO0uedNllWuabcef",
"refer_entity": {
"refer_token": 
"doxbcGvhSVN0R6octqPwAEabcef"
"refer_type": "docx"
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
"succ_shortcut_node": {
"token": "doxbcGvhSVN0R6octqPwAEabcef",
"name": "快捷方式名称",
"type": "docx",
"parent_token": "fldbc5qgwyQnO0uedNllWuabcef",
"url": "https://example.feishu.cn/docx/doxbcGvhSVN0R6octqPwAEabcef",
"shortcut_info": {
"target_type": "docx",
"target_token": "doxbcGvhSVN0R6octqPwAEabcef"
"created_time": "1686125119",
"modified_time": "1686125119",
"owner_id": "ou_b13d41c02edc52ce66aaae67bf1abcef"
### 错误码
HTTP状态码 | 错误码 | 描述 | 排查建议  
---|---|---|---  
500 | 1061001 | internal error. | 服务内部错误，包括超时，错误码没处理。  
400 | 1061002 | params error. | 请检查请求参数是否正确。  
404 | 1061003 | not found. | 请确认对应资源是否存在。  
403 | 1061004 | forbidden. | 请确认当前身份是否有对应上传节点的的权限，如用户是否有docx的阅读和文件夹的编辑权限。  
401 | 1061005 | auth failed. | 请使用正确身份访问该接口。  
404 | 1061007 | file has been delete. | 请确认对应节点未被删除。  
400 | 1062507 | parent node out of sibling num. | 云空间目录下挂载数量超过限制（单层1500限制 ）。  
400 | 1061045 | resource contention occurred, please retry. | 内部可重试错误，请稍后重试。  
403 | 1064510 | cross tenant and unit not support. | 不支持跨租户跨地域的请求。  
403 | 1064511 | cross brand not support. | 不支持跨品牌的请求。  
相关问题
[如何解决 tenant token invalid (99991663) 错误？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-fix-99991663-error)
[如何选择不同类型的 access token？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-choose-which-type-of-token-to-use)
遇到其他问题？问问 开放平台智能助手
