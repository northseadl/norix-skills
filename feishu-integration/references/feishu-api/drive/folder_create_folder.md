> API: https://open.feishu.cn/document/server-docs/docs/drive-v1/folder/create_folder

# 新建文件夹
该接口用于在用户云空间指定文件夹中创建一个空文件夹。
## 使用限制
  * 该接口不支持并发创建，且调用频率上限为 5QPS 以及 10000次/天。否则会返回 1061045 错误码，可通过稍后重试解决。
  * 云空间中根目录或文件夹的单层节点上限为 1500 个。超过此限制时，接口将返回 1062507 错误码。可通过新建节点到其它节点中解决。
  * 云空间中所有层级的节点总和的上限为 40 万个。


## 请求
HTTP URL | https://open.feishu.cn/open-apis/drive/v1/files/create_folder  
---|---  
HTTP Method | POST  
接口频率限制 |   
支持的应用类型 |  自建应用 商店应用  
权限要求 开启任一权限即可 |  查看、评论、编辑和管理云空间中所有文件 创建云空间文件夹  
### 请求头
名称 | 类型 | 必填 | 描述  
---|---|---|---  
Authorization | string |  应用调用 API 时，需要通过访问凭证（access_token）进行身份鉴权，不同类型的访问凭证可获取的数据范围不同，参考 [选择并获取访问凭证](https://open.feishu.cn/document/ukTMukTMukTM/uMTNz4yM1MjLzUzM) 。 **值格式** ："Bearer `access_token`" **可选值如下** ： tenant_access_token 以应用身份调用 API，可读写的数据范围由应用自身的 [数据权限范围](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions)决定。参考 [自建应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token_internal) 或 [商店应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token) 。示例值："Bearer t-g1044qeGEDXTB6NDJOGV4JQCYDGHRBARFTGT1234" user_access_token 以登录用户身份调用 API，可读写的数据范围由用户可读写的数据范围决定。参考 [获取 user_access_token](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token)。示例值："Bearer u-cjz1eKCEx289x1TXEiQJqAh5171B4gDHPq00l0GE1234"  
Content-Type | string | **固定值** ："application/json; charset=utf-8"  
### 请求体  
name | string |  文件夹名称 **长度限制** ： 1~256 个字节 **示例值** ："产品优化项目"  
folder_token | string |  父文件夹的 token。参数为空字符串时，表示在根目录下创建文件夹。你可参考[获取文件夹中的文件清单](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/list)获取某个文件夹的 token。了解更多，参考[文件夹概述](https://open.feishu.cn/document/ukTMukTMukTM/ugTNzUjL4UzM14CO1MTN/folder-overview)。 **示例值** ："fldbcO1UuPz8VwnpPx5a92abcef"  
### 请求示例
以下为固定的代码示例。如需根据实际场景调整请求参数，可打开 APl 调试台 输入参数后生成相应的示例代码 操作指引
curl-i-X POST 'https://open.
feishu.cn/open-apis/drive/v1/
files/create_folder' \
-H 'Authorization: Bearer 
t-7f1b******8e560' \
-H 'Content-Type: application/
json' \
"folder_token": 
"fldbcO1UuPz8VwnpPx5a92abcef",
"name": "产品优化项目"
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
"token": "fldbcddUuPz8VwnpPx5oc2abcef",
"url": "https://feishu.cn/drive/folder/fldbcddUuPz8VwnpPx5oc2abcef"
### 错误码
HTTP状态码 | 错误码 | 描述 | 排查建议  
---|---|---|---  
500 | 1061001 | internal error. | 服务内部错误，如超时等。请联系技术支持。  
400 | 1061002 | params error. | 请检查请求参数是否正确。  
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
401 | 1061005 | auth failed. | 请使用正确身份访问该接口。  
404 | 1061007 | file has been delete. | 请确认对应节点未被删除。  
400 | 1062507 | parent node out of sibling num. | 云空间中根目录或文件夹的单层节点超限。上限为 1500 个，你可通过将文件新建到不同文件夹中解决。  
400 | 1061045 | resource contention occurred, please retry. | 发生资源争用，请稍后重试。  
相关问题
[如何解决 tenant token invalid (99991663) 错误？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-fix-99991663-error)
[如何选择不同类型的 access token？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-choose-which-type-of-token-to-use)
遇到其他问题？问问 开放平台智能助手
