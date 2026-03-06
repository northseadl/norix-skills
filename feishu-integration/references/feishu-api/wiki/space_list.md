> API: https://open.feishu.cn/document/server-docs/docs/wiki-v2/space/list

# 获取知识空间列表
此接口用于获取有权限访问的知识空间列表。
## 注意事项
  * 使用 tenant access token 调用时，请确认应用或机器人拥有部分知识空间的访问权限，否则返回列表为空。参阅[如何将应用添加为知识库管理员（成员）](https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/wiki-v2/wiki-qa#b5da330b)。
  * 此接口为分页接口。由于权限过滤，可能返回列表为空，但当分页标记（has_more）为 true 时，可以继续分页请求。
  * 此接口不会返回**我的文档库** 。


## 请求
HTTP URL | https://open.feishu.cn/open-apis/wiki/v2/spaces  
---|---  
HTTP Method | GET  
接口频率限制 |   
支持的应用类型 |  自建应用 商店应用  
权限要求 开启任一权限即可 |  查看知识空间列表 查看、编辑和管理知识库 查看知识库  
### 请求头
名称 | 类型 | 必填 | 描述  
---|---|---|---  
Authorization | string |  应用调用 API 时，需要通过访问凭证（access_token）进行身份鉴权，不同类型的访问凭证可获取的数据范围不同，参考 [选择并获取访问凭证](https://open.feishu.cn/document/ukTMukTMukTM/uMTNz4yM1MjLzUzM) 。 **值格式** ："Bearer `access_token`" **可选值如下** ： tenant_access_token 以应用身份调用 API，可读写的数据范围由应用自身的 [数据权限范围](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions)决定。参考 [自建应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token_internal) 或 [商店应用获取 tenant_access_token](https://open.feishu.cn/document/ukTMukTMukTM/ukDNz4SO0MjL5QzM/auth-v3/auth/tenant_access_token) 。示例值："Bearer t-g1044qeGEDXTB6NDJOGV4JQCYDGHRBARFTGT1234" user_access_token 以登录用户身份调用 API，可读写的数据范围由用户可读写的数据范围决定。参考 [获取 user_access_token](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token)。示例值："Bearer u-cjz1eKCEx289x1TXEiQJqAh5171B4gDHPq00l0GE1234"  
Content-Type | string | **固定值** ："application/json; charset=utf-8"  
### 查询参数  
page_size | int |  分页大小 **示例值** ：10 **默认值** ：`20` **数据校验规则** ：
  * 最大值：`50`

  
page_token | string |  分页标记，第一次请求不填，表示从头开始遍历；分页查询结果还有更多项时会同时返回新的 page_token，下次遍历可采用该 page_token 获取查询结果 **示例值** ："1565676577122621"  
### 请求示例
以下为固定的代码示例。如需根据实际场景调整请求参数，可打开 APl 调试台 输入参数后生成相应的示例代码 操作指引
curl-i-XGET'https://open.
feishu.cn/open-apis/wiki/v2/
spaces?page_size=10&
page_token=1565676577122621' \
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
"items": [
"name": "知识空间",
"description": "知识空间描述",
"space_id": "1565676577122621"
"page_token": "1565676577122621",
"has_more": true
### 错误码
HTTP状态码 | 错误码 | 描述 | 排查建议  
---|---|---|---  
400 | 131001 | rpc fail | 服务报错（下游 RPC 调用失败），请稍后重试，或者拿响应体的header头里的x-tt-logid咨询[oncall](https://applink.feishu.cn/client/helpdesk/open?id=6626260912531570952)定位。  
400 | 131002 | param err | 通常为传参有误，例如数据类型不匹配。请查看响应体 msg 字段中的具体接口报错信息，报错不明确时请咨询[oncall](https://applink.feishu.cn/client/helpdesk/open?id=6626260912531570952)。  
400 | 131004 | invalid user | 非法用户（如未登陆或用户 ID 校验失败）。请咨询[oncall](https://applink.feishu.cn/client/helpdesk/open?id=6626260912531570952)。  
400 | 131007 | internal err | 服务内部错误，请勿重试，拿返回值的header头里的x-tt-logid咨询[oncall](https://applink.feishu.cn/client/helpdesk/open?id=6626260912531570952)定位。  
相关问题
[如何解决 tenant token invalid (99991663) 错误？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-fix-99991663-error)
遇到其他问题？问问 开放平台智能助手
