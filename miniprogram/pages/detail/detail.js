const storageUtil = require('../../utils/storage')
const fs = wx.getFileSystemManager()

Page({
  data: {
    taskId: '',
    taskName: '',
    startTimeStr: '',
    updateTimeStr: '',
    totalCount: 0,
    dataList: [],  // [{code, count}]
    showEditModal: false,
    editIndex: -1,
    editItem: null,
    editCount: ''
  },

  onLoad(options) {
    const { taskId } = options
    
    if (!taskId) {
      wx.showToast({
        title: '任务ID缺失',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }
    
    this.setData({ taskId })
    this.loadTaskData()
  },

  onShow() {
    // 每次显示页面时重新加载数据
    this.loadTaskData()
  },

  /**
   * 加载任务数据
   */
  loadTaskData() {
    const { taskId } = this.data
    const task = storageUtil.getTaskById(taskId)
    
    if (!task) {
      wx.showToast({
        title: '任务不存在',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }
    
    const startTime = new Date(task.startTime)
    const updateTime = new Date(task.updateTime)
    
    const dataList = storageUtil.getDataArray(task.data)
    const totalCount = Object.values(task.data).reduce((sum, val) => sum + val, 0)
    
    this.setData({
      taskName: task.name,
      startTimeStr: this.formatDate(startTime),
      updateTimeStr: this.formatDate(updateTime),
      totalCount,
      dataList
    })
  },

  /**
   * 格式化日期
   */
  formatDate(date) {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hour = date.getHours()
    const minute = date.getMinutes()
    
    return `${year}/${month}/${day} ${hour}:${minute}`
  },

  /**
   * 编辑数量
   */
  onEditCount(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.dataList[index]
    
    this.setData({
      showEditModal: true,
      editIndex: index,
      editItem: item,
      editCount: String(item.count)
    })
  },

  /**
   * 数量输入
   */
  onEditCountInput(e) {
    this.setData({ editCount: e.detail.value })
  },

  /**
   * 取消编辑
   */
  onCancelEdit() {
    this.setData({
      showEditModal: false,
      editIndex: -1,
      editItem: null,
      editCount: ''
    })
  },

  /**
   * 确认编辑
   */
  onConfirmEdit() {
    const { taskId, editIndex, editCount, dataList } = this.data

    const count = parseInt(editCount) || 0

    if (count <= 0) {
      wx.showToast({
        title: '数量必须大于0',
        icon: 'none'
      })
      return
    }

    // 更新数据
    const item = dataList[editIndex]
    const success = storageUtil.updateTaskItemCount(taskId, item.code, count)

    if (success) {
      // 关闭弹窗
      this.setData({
        showEditModal: false,
        editIndex: -1,
        editItem: null,
        editCount: ''
      })

      // 重新加载数据
      this.loadTaskData()

      wx.showToast({
        title: '修改成功',
        icon: 'success'
      })
    } else {
      wx.showToast({
        title: '修改失败',
        icon: 'none'
      })
    }
  },

  /**
   * 删除某条数据
   */
  onDeleteItem(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.dataList[index]

    wx.showModal({
      title: '确认删除',
      content: `确定要删除条码"${item.code}"吗？`,
      confirmColor: '#FA5151',
      success: (res) => {
        if (res.confirm) {
          const { taskId } = this.data
          const success = storageUtil.deleteTaskItem(taskId, item.code)

          if (success) {
            this.loadTaskData()

            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })
          } else {
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  /**
   * 导出数据
   */
  onExportData() {
    const { taskName, dataList } = this.data
    
    if (dataList.length === 0) {
      wx.showToast({
        title: '暂无数据可导出',
        icon: 'none'
      })
      return
    }
    
    // 生成 CSV 内容
    let csvContent = '\ufeff'  // BOM for UTF-8
    csvContent += '条码,数量\n'
    
    dataList.forEach(item => {
      csvContent += `${item.code},${item.count}\n`
    })
    
    // 写入临时文件
    const fileName = `${taskName}_${new Date().getTime()}.csv`
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`
    
    try {
      fs.writeFileSync(filePath, csvContent, 'utf8')
      
      // 分享文件
      wx.shareFileMessage({
        filePath: filePath,
        success: () => {
          wx.showToast({
            title: '分享成功',
            icon: 'success'
          })
        },
        fail: (err) => {
          console.error('分享文件失败:', err)
          
          // 如果分享失败，提示用户文件已保存
          wx.showModal({
            title: '导出成功',
            content: '文件已保存到本地，可通过"更多"分享',
            showCancel: false
          })
        }
      })
    } catch (e) {
      console.error('导出数据失败:', e)
      wx.showToast({
        title: '导出失败',
        icon: 'none'
      })
    }
  },

  /**
   * 分享数据
   */
  onShareData() {
    // 触发导出，然后分享
    this.onExportData()
  },

  /**
   * 继续扫码
   */
  onContinueScan() {
    const { taskId } = this.data
    
    wx.navigateTo({
      url: `/pages/scan/scan?taskId=${taskId}`
    })
  },

  /**
   * 返回列表
   */
  onGoBack() {
    wx.navigateBack()
  }
})
