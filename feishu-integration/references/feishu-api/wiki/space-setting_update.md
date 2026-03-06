> API: https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-setting/update

# 更新知识空间设置
根据space_id更新知识空间公共设置
知识库权限要求：
  * 为知识空间管理员


## 请求
HTTP URL | https://open.feishu.cn/open-apis/wiki/v2/spaces/:space_id/setting  
---|---  
HTTP Method | PUT  
接口频率限制 |   
支持的应用类型 |  自建应用 商店应用  
权限要求 开启任一权限即可 |  更新知识空间设置 查看、编辑和管理知识库  
### 请求头
名称 | 类型 | 必填 | 描述  
---|---|---|---  
Authorization | string |  应用调用 API 时，需要通过访问凭证（access_token）进行身份鉴权，不同类型的访问凭证可获取的数据范围不同，参考 [选择并获取访问凭证](https://open.feishu.cn/document/ukTMukTMukTM/uMTNz4yM1MjLzUzM) 。 **值格式** ："Bearer `access_token`" **可选值如下** ： tenant_access_token 以应用身份调用 API，可读写的数据范围由应用自身的 [数据权限范围](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions)决定。参考 [自建应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token_internal) 或 [商店应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token) 。示例值："Bearer t-g1044qeGEDXTB6NDJOGV4JQCYDGHRBARFTGT1234" user_access_token 以登录用户身份调用 API，可读写的数据范围由用户可读写的数据范围决定。参考 [获取 user_access_token](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token)。示例值："Bearer u-cjz1eKCEx289x1TXEiQJqAh5171B4gDHPq00l0GE1234"  
Content-Type | string | **固定值** ："application/json; charset=utf-8"  
### 路径参数  
space_id | string |  知识空间id **示例值** ："1565676577122621"  
### 请求体  
create_setting | string |  谁可以创建空间的一级页面： "admin_and_member" = 管理员和成员 "admin" - 仅管理员 **示例值** ："admin/admin_and_member"  
security_setting | string |  可阅读用户可否创建副本/打印/导出/复制： "allow" - 允许 "not_allow" - 不允许 **示例值** ："allow/not_allow"  
comment_setting | string |  可阅读用户可否评论： "allow" - 允许 "not_allow" - 不允许 **示例值** ："allow/not_allow"  
### 请求示例
以下为固定的代码示例。如需根据实际场景调整请求参数，可打开 APl 调试台 输入参数后生成相应的示例代码 操作指引
curl-i-X PUT 'https://open.
feishu.cn/open-apis/wiki/v2/
spaces/1565676577122621/setting'
-H 'Authorization: Bearer 
t-7f1b******8e560' \
-H 'Content-Type: application/
json' \
"comment_setting": "allow/
not_allow",
"create_setting": "admin/
admin_and_member",
"security_setting": "allow/
not_allow"
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
"setting": {
"create_setting": "admin/admin_and_member",
"security_setting": "allow/not_allow",
"comment_setting": "allow/not_allow"
### 错误码
HTTP状态码 | 错误码 | 描述 | 排查建议  
---|---|---|---  
400 | 131001 | rpc fail | 服务报错，请稍后重试，或者拿响应体的header头里的x-tt-logid咨询[oncall](https://applink.feishu.cn/client/helpdesk/open?id=6626260912531570952)定位。  
400 | 131002 | param err | 通常为传参有误，例如数据类型不匹配。请查看**具体接口报错信息** ，报错不明确时请咨询[oncall](https://applink.feishu.cn/client/helpdesk/open?id=6626260912531570952)。  
400 | 131004 | invalid user | 非法用户。请咨询[oncall](https://applink.feishu.cn/client/helpdesk/open?id=6626260912531570952)。  
400 | 131005 | not found |  未找到相关数据，例如id不存在。相关报错信息参考：
  * member not found：用户不是知识空间成员（管理员），无法删除。
  * identity not found: userid不存在，无法添加/删除成员。
  * space not found：知识空间不存在
  * node not found：节点不存在
  * document not found：文档不存在

报错不明确时请咨询[oncall](https://applink.feishu.cn/client/helpdesk/open?id=6626260912531570952)。  
400 | 131006 | permission denied |  权限拒绝，相关报错信息参考：
  * wiki space permission denied：知识库权限鉴权不通过，需要成为知识空间管理员（成员）。
  * node permission denied：文档节点权限鉴权不通过，读操作需要具备节点阅读权限，写操作（创建、移动等）则需要具备节点容器编辑权限。
  * no source parent node permission：需要具备原父节点的容器编辑权限。
  * no destination parent node permission：需要具备目标父节点的容器编辑权限，若移动到知识空间下，则需要成为知识空间管理员（成员）。

**注意** ：应用访问或操作文档时，除了申请 API 权限，还需授权具体文档资源的阅读、编辑或管理权限。 请参考以下步骤操作：
  1. **当遇到资源权限不足的情况** ：参阅[如何给应用授权访问知识库文档资源](https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/wiki-v2/wiki-qa#a40ad4ca)。
  2. **也可直接将应用添加为知识库管理员（成员）** ：参阅[如何将应用添加为知识库管理员（成员）](https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/wiki-v2/wiki-qa#b5da330b)。
  3. **若无法解决或报错信息不明确时** ：请咨询[技术支持](https://applink.feishu.cn/client/helpdesk/open?id=6626260912531570952)。

  
400 | 131007 | internal err | 服务内部错误，请勿重试，拿返回值的header头里的x-tt-logid咨询[oncall](https://applink.feishu.cn/client/helpdesk/open?id=6626260912531570952)定位。  
400 | 131101 | invalid operation |  无效知识空间操作。例如公开空间禁止添加成员。 请参考具体接口报错信息和文档描述。  
相关问题
[如何解决 tenant token invalid (99991663) 错误？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-fix-99991663-error)
遇到其他问题？问问 开放平台智能助手
