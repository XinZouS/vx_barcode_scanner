const storageUtil = require('../../utils/storage')

Page({
  data: {
    taskList: []
  },

  onLoad() {
    this.loadTaskList()
  },

  onShow() {
    // 每次显示页面时重新加载任务列表
    this.loadTaskList()
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
