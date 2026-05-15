// pages/stock-check/stock-check.js
// 扫码统计页面 - 库存统计功能（简化版）
const request = require('../../utils/request')

Page({
  data: {
    // 统计进度
    progress: {
      checked: 0,
      unchecked: 0,
      total: 0,
      is_in_progress: false
    },
    progressPercent: 0,
    progressWidth: '0%',

    // 搜索相关
    searchKey: '',
    searchLoading: false,
    searched: false,
    searchResults: [],
    currentItem: null,
    quantityDisplay: '',
    isItemExpired: false,
    actualQty: '',

    // 提交相关
    startLoading: false,
    submitLoading: false,

    // 计算属性
    computedDelta: null,
    deltaClass: '',
    submitBtnText: '提交统计结果',
    isChecked: false,

    // 货位相关
    showAllocationDialog: false,
    showCreateAllocationDialog: false,
    allocationList: [],
    filteredAllocations: [],
    allocationSearchKey: '',
    selectedAllocationId: null,
    currentAllocationName: '',
    newAllocationName: '',

  },

  onLoad() {
    this.fetchProgress()
  },

  onShow() {
    this.fetchProgress()
  },

  /**
   * 接收扫码页面返回的结果
   */
  handleScanResult(code) {
    if (code) {
      this.setData({ searchKey: code })
      this.doSearch()
    }
  },

  // ========== 统计进度相关 ==========
  async fetchProgress() {
    try {
      const data = await request.get('/stock/checking/progress/')
      const percent = data.total > 0 ? Math.round((data.checked / data.total) * 100) : 0
      this.setData({
        progress: data,
        progressPercent: percent,
        progressWidth: percent + '%'
      })
    } catch (err) {
      this.showError(err)
    }
  },

  async handleStartCheck() {
    const { progress, startLoading } = this.data
    if (startLoading) return

    const confirmMsg = progress.is_in_progress
      ? `当前有统计进行中（已统计 ${progress.checked} 条，待统计 ${progress.unchecked} 条）。\n重新开始将重置所有物品为"待统计"状态，确认吗？`
      : '将把数量大于0的物品标记为待统计状态'

    wx.showModal({
      title: '开始统计',
      content: confirmMsg,
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ startLoading: true })
          try {
            const data = await request.post('/stock/checking/start/')
            wx.showToast({
              title: data.detail || '统计已开始',
              icon: 'success'
            })
            await this.fetchProgress()
          } catch (err) {
            this.showError(err)
          } finally {
            this.setData({ startLoading: false })
          }
        }
      }
    })
  },

  // ========== 扫码功能（使用项目已有的扫码页面）==========
  handleScan() {
    // 跳转到项目已有的扫码页面
    wx.navigateTo({
      url: '/pages/scan/scan?mode=return',  // 添加 mode=return 参数，表示扫码后返回结果
      events: {
        // 监听扫码页面的回调
        scanResult: (data) => {
          const code = data.code
          this.setData({ searchKey: code })
          this.doSearch()
        }
      },
      success: (res) => {
        // 向扫码页面传递回调函数
        res.eventChannel.emit('setScanCallback', { 
          callback: (code) => {
            // 扫码成功后的回调
            this.setData({ searchKey: code })
            this.doSearch()
          }
        })
      }
    })
  },

  // ========== 搜索相关 ==========
  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
  },

  clearSearch() {
    this.setData({
      searchKey: '',
      searched: false,
      searchResults: [],
      currentItem: null,
      quantityDisplay: '',
      isItemExpired: false,
      actualQty: '',
      computedDelta: null,
      deltaClass: '',
      submitBtnText: '提交统计结果',
      isChecked: false
    })
  },

  async doSearch() {
    const { searchKey } = this.data
    if (!searchKey.trim()) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }

    this.setData({ searchLoading: true, searched: false })

    try {
      const data = await request.get('/stock/goods_search/', {
        key: searchKey
      })

      if (!data || data.length === 0) {
        wx.showToast({ title: '未找到匹配的物品记录', icon: 'none' })
        this.setData({ searched: true, searchResults: [], currentItem: null })
      } else if (data.length === 1) {
        this.selectItem(data[0])
        this.setData({ searched: true, searchResults: [] })
      } else {
        this.setData({ searched: true, searchResults: data })
      }
    } catch (err) {
      this.showError(err)
      this.setData({ searched: true, searchResults: [], currentItem: null })
    } finally {
      this.setData({ searchLoading: false })
    }
  },

  selectItem(itemOrEvent) {
    // 兼容两种调用方式：
    // 1. 从 WXML bindtap 调用：传入事件对象 e，需从 dataset 中取 item
    // 2. 从 JS 直接调用：直接传入 item 对象
    const item = itemOrEvent.currentTarget ? itemOrEvent.currentTarget.dataset.item : itemOrEvent

    if (!item) {
      return
    }

    const quantity = Number(item.quantity) || 0
    const isExpired = this.checkExpired(item.expire_date)

    this.setData({
      currentItem: item,
      searchResults: [],
      quantityDisplay: quantity.toString(),
      isItemExpired: isExpired,
      actualQty: quantity.toString(),
      isChecked: item.ischecked === true
    })

    this.calculateDelta()
  },

  checkExpired(dateStr) {
    if (!dateStr) return false
    return new Date(dateStr) < new Date()
  },

  // ========== 数量相关 ==========
  onActualQtyInput(e) {
    this.setData({ actualQty: e.detail.value })
    this.calculateDelta()
  },

  onQtyMinus() {
    const { actualQty } = this.data
    const currentVal = parseInt(actualQty) || 0
    if (currentVal > 0) {
      const newVal = currentVal - 1
      this.setData({ actualQty: newVal.toString() })
      this.calculateDelta()
    }
  },

  onQtyPlus() {
    const { actualQty } = this.data
    const currentVal = parseInt(actualQty) || 0
    const newVal = currentVal + 1
    this.setData({ actualQty: newVal.toString() })
    this.calculateDelta()
  },

  calculateDelta() {
    const { currentItem, actualQty } = this.data
    if (!currentItem || actualQty === '') {
      this.setData({ 
        computedDelta: null, 
        deltaClass: '',
        submitBtnText: '提交统计结果'
      })
      return
    }

    const delta = Number(currentItem.quantity) - Number(actualQty)
    let deltaClass = ''
    let submitBtnText = '提交统计结果'

    if (delta > 0) {
      deltaClass = 'delta-loss'
      submitBtnText = `提交报损（短缺 ${delta}）`
    } else if (delta < 0) {
      deltaClass = 'delta-overage'
      submitBtnText = `提交报溢（溢出 ${-delta}）`
    } else {
      deltaClass = 'delta-ok'
      submitBtnText = '✓ 数量相符 - 提交'
    }

    this.setData({
      computedDelta: delta,
      deltaClass,
      submitBtnText
    })
  },

  // ========== 提交统计 ==========
  async handleSubmitCheck() {
    const { currentItem, actualQty, submitLoading } = this.data

    if (!currentItem || actualQty === '') {
      wx.showToast({ title: '请输入实际数量', icon: 'none' })
      return
    }

    if (submitLoading) return

    this.setData({ submitLoading: true })

    // 开始提交时短震1下
    wx.vibrateShort({ type: 'medium' })

    try {
      const result = await request.post('/stock/checking/submit/', {
        stock_goods_id: currentItem.id,
        actual_qty: actualQty
      })

      const delta = Number(result.delta || 0)

      // 提交成功后快速短震2下
      wx.vibrateShort({ type: 'medium' })
      setTimeout(() => {
        wx.vibrateShort({ type: 'medium' })
      }, 100)

      // 提示结果
      if (delta === 0) {
        wx.showToast({ title: '完成：数量相符 ✓', icon: 'success' })
      } else if (delta > 0) {
        wx.showToast({
          title: `完成：短缺 ${Math.abs(delta)}`,
          icon: 'none'
        })
      } else {
        wx.showToast({
          title: `完成：溢出 ${Math.abs(delta)}`,
          icon: 'none'
        })
      }

      // 刷新状态
      await this.fetchProgress()

      // 清空当前商品
      this.setData({
        currentItem: null,
        quantityDisplay: '',
        isItemExpired: false,
        actualQty: '',
        computedDelta: null,
        deltaClass: '',
        submitBtnText: '提交统计结果',
        isChecked: false,
        searchKey: ''
      })
    } catch (err) {
      this.showError(err)
    } finally {
      this.setData({ submitLoading: false })
    }
  },

  // ========== 货位相关方法 ==========
  async fetchAllocations() {
    try {
      const data = await request.get('/goods/allocation/')
      this.setData({
        allocationList: data || [],
        filteredAllocations: data || []
      })
    } catch (err) {
      wx.showToast({ title: '获取货位列表失败', icon: 'none' })
    }
  },

  openAllocationDialog() {
    const { currentItem } = this.data
    if (!currentItem) {
      wx.showToast({ title: '请先选择物品', icon: 'none' })
      return
    }

    // 获取货位列表
    this.fetchAllocations()

    // 如果当前物品已有货位，选中它
    const selectedAllocationId = currentItem.allocation_id || null

    this.setData({
      showAllocationDialog: true,
      selectedAllocationId,
      allocationSearchKey: '',
      filteredAllocations: this.data.allocationList
    })
  },

  closeAllocationDialog() {
    this.setData({
      showAllocationDialog: false,
      allocationSearchKey: '',
      filteredAllocations: []
    })
  },

  onAllocationSearchInput(e) {
    const searchKey = e.detail.value.toLowerCase()
    const { allocationList } = this.data

    if (!searchKey) {
      this.setData({
        allocationSearchKey: e.detail.value,
        filteredAllocations: allocationList
      })
      return
    }

    const filtered = allocationList.filter(item =>
      item.name.toLowerCase().includes(searchKey)
    )

    this.setData({
      allocationSearchKey: e.detail.value,
      filteredAllocations: filtered
    })
  },

  selectAllocation(e) {
    const { id, name } = e.currentTarget.dataset
    this.setData({ selectedAllocationId: id })
  },

  confirmAllocation() {
    const { selectedAllocationId, filteredAllocations, currentItem } = this.data

    if (!selectedAllocationId) {
      wx.showToast({ title: '请选择货位', icon: 'none' })
      return
    }

    const selectedAllocation = filteredAllocations.find(item => item.id === selectedAllocationId)
    if (!selectedAllocation) {
      wx.showToast({ title: '货位不存在', icon: 'none' })
      return
    }

    // 更新当前物品的货位
    this.setData({
      currentAllocationName: selectedAllocation.name,
      showAllocationDialog: false,
      allocationSearchKey: '',
      filteredAllocations: []
    })

    // 可选：如果需要保存到服务器，可以在这里调用API
    // this.saveAllocationToServer(currentItem.id, selectedAllocationId)
  },

  openCreateAllocationDialog() {
    this.setData({
      showCreateAllocationDialog: true,
      newAllocationName: ''
    })
  },

  closeCreateAllocationDialog() {
    this.setData({
      showCreateAllocationDialog: false,
      newAllocationName: ''
    })
  },

  onNewAllocationInput(e) {
    this.setData({ newAllocationName: e.detail.value })
  },

  async submitCreateAllocation() {
    const { newAllocationName } = this.data

    if (!newAllocationName.trim()) {
      wx.showToast({ title: '请输入货位名称', icon: 'none' })
      return
    }

    try {
      const data = await request.post('/goods/allocation/', {
        name: newAllocationName.trim()
      })

      wx.showToast({ title: '新增成功', icon: 'success' })

      // 关闭新增弹窗
      this.setData({
        showCreateAllocationDialog: false,
        newAllocationName: ''
      })

      // 刷新货位列表并自动选中新增的货位
      await this.fetchAllocations()

      // 自动选中新增的货位
      this.setData({
        selectedAllocationId: data.id,
        currentAllocationName: data.name
      })
    } catch (err) {
      this.showError(err)
    }
  },

  preventBubble() {
    // 阻止事件冒泡
  },

  // ========== 错误提示 ==========
  parseErrorDetail(detail) {
    if (!detail) return '操作失败'
    
    // 如果是字符串，直接返回
    if (typeof detail === 'string') return detail
    
    // 如果是对象，遍历所有键值对
    if (typeof detail === 'object' && detail !== null) {
      const errorMessages = []
      
      for (const key in detail) {
        if (detail.hasOwnProperty(key)) {
          const value = detail[key]
          let valueStr = ''
          
          // 如果 value 是数组，拼接数组中的字符串
          if (Array.isArray(value)) {
            valueStr = value.join(' ')
          } else if (typeof value === 'string') {
            valueStr = value
          } else {
            valueStr = String(value)
          }
          
          // 格式：key: value
          errorMessages.push(`${key}: ${valueStr}`)
        }
      }
      
      // 如果有多个错误，用换行符分隔
      return errorMessages.join('\n')
    }
    
    return String(detail)
  },

  showError(err) {
    // 优先使用 err.message（已由 request.js 解析好）
    let message = (err && err.message) || '操作失败'
    
    // 统一使用 showModal 显示错误，确保用户注意到
    // 标题使用醒目的【错误】标识，确认按钮用红色
    wx.showModal({
      title: '【错误】',
      content: message,
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#fa5151'  // 红色确认按钮
    })
  }
})
