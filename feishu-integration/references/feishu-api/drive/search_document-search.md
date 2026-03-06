> API: https://open.feishu.cn/document/server-docs/docs/drive-v1/search/document-search

# 搜索云文档
该接口用于根据搜索关键词（search_key）对当前用户可见的云文档进行搜索。
## 请求
HTTP URL | https://open.feishu.cn/open-apis/suite/docs-api/search/object  
---|---  
HTTP Method | POST  
支持的应用类型 |  自建应用 商店应用  
权限要求  |  查看、评论、编辑和管理云文档所有文件 查看、评论和下载云文档所有文件 搜索云文档  
### 请求头
名称 | 类型 | 必填 | 描述  
---|---|---|---  
Authorization | string |  通过访问凭证（access_token）对调用者身份进行鉴权。可选值：
  * user_access_token：用户授权凭证。应用代表用户执行对应操作。示例值："Bearer u-7f1bcd13fc57d46bac21793aabcef" 

了解更多，参考[获取访问凭证](https://open.feishu.cn/document/ukTMukTMukTM/uMTNz4yM1MjLzUzM)。  
Content-Type | string | **固定值** ："application/json; charset=utf-8"  
### 请求体
参数 | 类型 | 必须 | 说明  
---|---|---|---  
search_key | string | 指定搜索的关键字。  
count | int | 指定搜索返回的文件数量。取值范围为 [0,50]。  
offset | int | 指定搜索的偏移量，该参数最小为 0，即不偏移。该参数的值与返回的文件数量之和不得大于或等于 200（即 offset + count < 200）。  
owner_ids | list<string> | 文件所有者的 Open ID。了解更多，参考[如何获取 Open ID](https://open.feishu.cn/document/home/user-identity-introduction/open-id)。  
chat_ids | list<string> | 文件所在群的 ID。了解更多，参考[群 ID 说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/chat-id-description)。  
docs_types | list<string> |  文件类型，支持以下枚举：
  * `doc`：文档，包括旧版文档（doc）和新版文档（docx）
  * `sheet`：电子表格
  * `slides`：幻灯片
  * `bitable`：多维表格
  * `mindnote`：思维笔记
  * `file`：文件

  
### 请求体示例
```




    "search_key": "项目",



    "count": 10, 


    "offset": 0,



    "owner_ids": ["13eabcef"],



    "chat_ids": [],



    "docs_types": ["doc", "sheet"]





```

## 响应
### 响应体
名称 展开子列表  
---  
docs_entities | docs_entities[] | 包含搜索关键词的文件列表  
has_more | boolean | 结果列表后是否还有数据  
total | 包含搜索关键词的文件总数量  
### 响应体示例
```




    "code": 0,



    "data": {



        "docs_entities": [




                "docs_token": "shtcnLkpxnlYksumuGNZM1abcef",



                "docs_type": "sheet",



                "owner_id": "ou_b97fbe610114d9489ff3b501a71abcef",



                "title": "项目进展周报"





                "docs_token": "shtcnHO7UvaulkYDXCyQraabcef",



                "docs_type": "sheet",



                "owner_id": "ou_b97fbe610114d9489ff3b501a71abcef",



                "title": "项目管理十大模板"





                "docs_token": "shtcnO2W1D0YqKZ5TY9z3Cabcef",



                "docs_type": "sheet",



                "owner_id": "ou_b97fbe610114d9489ff3b501a71abcef",



                "title": "项目甘特图"





                "docs_token": "shtcnGVvAVJdohCOnmQvMNabcef",



                "docs_type": "sheet",



                "owner_id": "ou_b97fbe610114d9489ff3b501a71abcef",



                "title": "工作周计划"





                "docs_token": "shtcnwdKlAT243SF95pokXabcef",



                "docs_type": "sheet",



                "owner_id": "ou_b97fbe610114d9489ff3b501a71abcef",



                "title": "面试记录"





                "docs_token": "shtcnfgRI0jwwY0ISPSlRlabcef",



                "docs_type": "sheet",



                "owner_id": "ou_b97fbe610114d9489ff3b501a71abcef",



                "title": "工作月计划"





                "docs_token": "shtcnfsEaTYMVTwT0DbNolabcef",



                "docs_type": "sheet",



                "owner_id": "ou_b97fbe610114d9489ff3b501a71abcef",



                "title": "团队文件资料库"





                "docs_token": "shtcn3grVqPADzPt08RiFnabcef",



                "docs_type": "sheet",



                "owner_id": "ou_b97fbe610114d9489ff3b501a71abcef",



                "title": " 费用报销单"





                "docs_token": "shtcne3WuFpvRbSsG3SLL7abcef",



                "docs_type": "sheet",



                "owner_id": "ou_b97fbe610114d9489ff3b501a71abcef",



                "title": "费用预算表"





                "docs_token": "IVGMsOakbhd96It63kkc3aabcef",



                "docs_type": "sheet",



                "owner_id": "ou_b97fbe610114d9489ff3b501a71abcef",



                "title": "团建日程安排"





        "has_more": true,



        "total": 59




    "msg": "success"





```

### 错误码
具体可参考：[服务端错误码说明](https://open.feishu.cn/document/ukTMukTMukTM/ugjM14COyUjL4ITN)。
相关问题
[如何解决 tenant token invalid (99991663) 错误？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-fix-99991663-error)
[如何选择不同类型的 access token？](https://open.feishu.cn/document/faq/trouble-shooting/how-to-choose-which-type-of-token-to-use)
遇到其他问题？问问 开放平台智能助手
你觉得搜索结果有帮助吗？
没有帮助
不再显示
