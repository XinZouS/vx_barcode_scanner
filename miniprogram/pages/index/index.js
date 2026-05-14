const storageUtil = require('../../utils/storage')
const userManager = require('../../utils/user')

Page({
  data: {
    taskList: [],
    isLoggedIn: false,
    username: '',
    showUserMenu: false
  },

  onLoad() {
    this.loadTaskList()
    this.checkLoginStatus()
  },

  onShow() {
    // 每次显示页面时重新加载任务列表和登录状态
    this.loadTaskList()
    this.checkLoginStatus()
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    const isLoggedIn = userManager.checkLogin()
    const userInfo = userManager.getUserInfo()

    this.setData({
      isLoggedIn,
      // 优先显示 user_display_name，如果没有则显示 username
      username: userInfo ? userInfo.user_display_name || userInfo.username || '用户' : ''
    })
  },

  /**
   * 跳转到登录页
   */
  goLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  /**
   * 跳转到统计条目页面
   */
  goStockCheck() {
    wx.navigateTo({
      url: '/pages/stock-check/stock-check'
    })
    this.setData({ showUserMenu: false })
  },

  /**
   * 显示用户菜单
   */
  showUserMenu() {
    this.setData({ showUserMenu: true })
  },

  /**
   * 隐藏用户菜单
   */
  hideUserMenu() {
    this.setData({ showUserMenu: false })
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 空函数，用于阻止事件冒泡
  },

  /**
   * 退出登录
   */
  doLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      confirmColor: '#FA5151',
      success: (res) => {
        if (res.confirm) {
          userManager.logout()
          this.setData({
            isLoggedIn: false,
            username: '',
            showUserMenu: false
          })

          wx.showToast({
            title: '已退出登录',
            icon: 'success',
            duration: 1500
          })
        }
      }
    })
  },

  /**
   * 加载任务列表
   */
  loadTaskList() {
    const taskList = storageUtil.getTaskList()
    
    // 处理任务数据，添加显示所需的字段
    const processedList = taskList.map(task => {
      const updateTime = new Date(task.updateTime)
      return {
        ...task,
        isEditing: false,
        editName: task.name,
        updateTimeStr: this.formatDate(updateTime),
        codeCount: Object.keys(task.data).length
      }
    })
    
    this.setData({
      taskList: processedList
    })
  },

  /**
   * 格式化日期
   */
  formatDate(date) {
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hour = date.getHours()
    const minute = date.getMinutes()
    
    return `${month}/${day} ${hour}:${minute}`
  },

  /**
   * 新建任务
   */
  onNewTask() {
    wx.showModal({
      title: '新建任务',
      editable: true,
      placeholderText: '请输入任务名称（可选）',
      success: (res) => {
        if (res.confirm) {
          const taskName = res.content || ''
          const newTask = storageUtil.createTask(taskName)
          
          wx.showToast({
            title: '任务创建成功',
            icon: 'success',
            duration: 1500
          })
          
          // 跳转到扫码页面
          setTimeout(() => {
            wx.navigateTo({
              url: `/pages/scan/scan?taskId=${newTask.id}`
            })
          }, 1500)
        }
      }
    })
  },

  /**
   * 点击任务（进入编辑模式）
   */
  onTaskTap(e) {
    const task = e.currentTarget.dataset.task
    const index = this.data.taskList.findIndex(t => t.id === task.id)
    
    if (index !== -1) {
      const key = `taskList[${index}].isEditing`
      const editKey = `taskList[${index}].editName`
      
      this.setData({
        [key]: true,
        [editKey]: task.name
      })
    }
  },

  /**
   * 任务名称输入
   */
  onNameInput(e) {
    const index = e.currentTarget.dataset.index
    const key = `taskList[${index}].editName`
    
    this.setData({
      [key]: e.detail.value
    })
  },

  /**
   * 任务名称编辑完成
   */
  onNameBlur(e) {
    const index = e.currentTarget.dataset.index
    const task = this.data.taskList[index]
    const newName = e.detail.value.trim()
    
    if (newName && newName !== task.name) {
      // 更新任务名称
      storageUtil.updateTaskName(task.id, newName)
      
      const nameKey = `taskList[${index}].name`
      this.setData({
        [nameKey]: newName
      })
    }
    
    // 退出编辑模式
    const editKey = `taskList[${index}].isEditing`
    this.setData({
      [editKey]: false
    })
  },

  /**
   * 继续扫码
   */
  onContinueScan(e) {
    const task = e.currentTarget.dataset.task
    
    wx.navigateTo({
      url: `/pages/scan/scan?taskId=${task.id}`
    })
  },

  /**
   * 查看详情
   */
  onViewDetail(e) {
    const task = e.currentTarget.dataset.task
    
    wx.navigateTo({
      url: `/pages/detail/detail?taskId=${task.id}`
    })
  },

  /**
   * 删除任务
   */
  onDeleteTask(e) {
    const task = e.currentTarget.dataset.task
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除任务"${task.name}"吗？`,
      success: (res) => {
        if (res.confirm) {
          storageUtil.deleteTask(task.id)
          
          wx.showToast({
            title: '删除成功',
            icon: 'success',
            duration: 1500
          })
          
          this.loadTaskList()
        }
      }
    })
  }
})
