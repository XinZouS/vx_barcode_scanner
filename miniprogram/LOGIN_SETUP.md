# 小程序登录功能配置指南

## 已完成的功能

### 1. 用户状态管理 (`utils/user.js`)
- ✅ 单例模式管理用户登录状态
- ✅ 自动从本地存储恢复登录状态
- ✅ 提供 `login()`, `logout()`, `getToken()`, `checkLogin()` 等方法
- ✅ 正确处理接口返回的 `routers`, `permissions`, `menus` 字段（不存储到 userInfo）

### 2. 统一请求工具 (`utils/request.js`)
- ✅ 封装 `wx.request`，类似 axios 的拦截器功能
- ✅ 自动注入 Token 到请求头
- ✅ 统一处理 401 未授权错误
- ✅ 提供 `.get()`, `.post()`, `.put()`, `.delete()` 便捷方法
- ⚠️ **需要配置 API 域名**（见下方说明）

### 3. 登录页面 (`pages/login/`)
- ✅ 简洁的登录表单（用户名 + 密码）
- ✅ 显示/隐藏密码功能
- ✅ 记住登录选项
- ✅ 表单验证和错误提示
- ✅ 风格与小程序现有页面一致
- ✅ 正确处理服务端返回的数据结构

### 4. 主页右上角用户区域 (`pages/index/`)
- ✅ 未登录时显示"登录"按钮
- ✅ 已登录时显示用户头像和用户名（优先显示 `user_display_name`）
- ✅ 点击用户头像弹出菜单（退出登录）

---

## ⚠️ 需要你配置的内容

### 1. 修改 API 域名

打开 `miniprogram/utils/request.js`，找到第 17 行：

```javascript
const BASE_URL = 'http://localhost:8000/api';  // ← 先改成开发环境测试
```

#### 如何找到生产域名？

**方法1：查看 Web 项目的配置文件**
```bash
# 在你的 Web 项目目录中查找
cat .env.production
# 或
cat .env.prod

# 寻找类似这样的配置：
# VUE_APP_API_BASE_URL=https://api.yourdomain.com/api
```

**方法2：查看 Web 项目的 `axios.js` 或 `request.js`**
```javascript
// 寻找 baseURL 的配置
baseURL: process.env.NODE_ENV === 'production' 
  ? '/api/' 
  : 'http://localhost:8000/api/'
```

**方法3：询问后端同事**
- 直接问："我们的生产环境 API 域名是什么？"
- 通常是：`https://api.yourdomain.com` 或 `https://yourdomain.com/api`

#### 修改示例：

```javascript
// 开发环境（本地测试）
const BASE_URL = 'http://localhost:8000/api';

// 生产环境（部署后）
const BASE_URL = 'https://api.yourdomain.com/api';
```

---

### 2. 在微信小程序后台添加合法域名

登录 [微信公众平台](https://mp.weixin.qq.com/) → 开发管理 → 开发设置 → 服务器域名：

1. 添加你的 API 域名到 **request 合法域名**
2. 例如：`https://api.yourdomain.com`

⚠️ **注意**：
- 微信小程序只支持 **HTTPS** 域名（生产环境）
- 开发环境可勾选"不校验合法域名"（微信开发者工具 → 详情 → 本地设置）

---

## 📝 使用说明

### 登录流程
1. 打开小程序，主页右上角显示"登录"按钮
2. 点击"登录"，进入登录页面
3. 输入用户名和密码，点击"登录"
4. 登录成功，自动保存 Token 和用户信息，返回主页
5. 右上角显示用户头像和用户名

### 调用 API 示例

```javascript
const request = require('../../utils/request');

// GET 请求
request.get('/api/endpoint', { param1: 'value1' })
  .then(data => {
    console.log('成功:', data);
  })
  .catch(err => {
    console.error('失败:', err);
  });

// POST 请求
request.post('/api/endpoint', { key: 'value' })
  .then(data => {
    console.log('成功:', data);
  });
```

---

## 🔧 测试建议

1. **先用开发环境测试**（localhost:8000）
   - 修改 `utils/request.js` 的 `BASE_URL`
   - 在微信开发者工具中勾选"不校验合法域名"
   - 测试登录流程

2. **测试通过后，再配置生产域名**
   - 修改 `BASE_URL` 为生产域名
   - 在微信公众平台添加合法域名
   - 重新编译小程序测试

---

## 📞 需要帮助？

如果遇到问题，请提供：
1. 错误截图或错误信息
2. 网络请求的详细信息（可以在微信开发者工具的"网络"面板查看）
3. 后端接口的具体返回数据

我会帮你排查问题！
