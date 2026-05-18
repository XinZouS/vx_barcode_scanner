// pages/stock-check/stock-check.js
// 扫码统计页面 - 库存统计功能
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
    // 全局指定货位（跨物品持久化）
    specifiedAllocationId: null,
    specifiedAllocationName: '',
    autoLinkEnabled: true
  },

  onLoad() {
    this.fetchProgress()
    // 从 storage 恢复全局货位设置
    const saved = wx.getStorageSync('stockCheckAllocation')
    if (saved && saved.id) {
      this.setData({
        specifiedAllocationId: saved.id,
        specifiedAllocationName: saved.name || '',
        autoLinkEnabled: saved.autoLink !== false
      })
    }
  },

  onShow() {
    this.fetchProgress()
  },

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

  // ========== 扫码功能 ==========
  handleScan() {
    wx.navigateTo({
      url: '/pages/scan/scan?mode=return',
      events: {
        scanResult: (data) => {
          const code = data.code
          this.setData({ searchKey: code })
          this.doSearch()
        }
      },
      success: (res) => {
        res.eventChannel.emit('setScanCallback', {
          callback: (code) => {
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

    this.setData({ searchLoading: true, searched: false, currentItem: null })

    try {
      const data = await request.get('/stock/goods_search/', {
        key: searchKey
      })

      if (!data || data.length === 0) {
        wx.showToast({ title: '未找到匹配的物品记录', icon: 'none' })
        this.setData({ searched: true, searchResults: [], currentItem: null })
      } else if (data.length === 1) {
        this.selectItem(data[0])
        this.setData({ searched: true, searchResults: data })
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
    const item = itemOrEvent.currentTarget ? itemOrEvent.currentTarget.dataset.item : itemOrEvent
    if (!item) return

    this.setData({
      currentItem: item,
      quantityDisplay: (Number(item.quantity) || 0).toString(),
      isItemExpired: item.expire_date ? new Date(item.expire_date) < new Date() : false,
      actualQty: (Number(item.quantity) || 0).toString(),
      isChecked: item.ischecked === true
    })
    this.calculateDelta()
  },

  closeGoodsCard() {
    this.setData({ currentItem: null })
  },

  // ========== 数量相关 ==========
  onActualQtyInput(e) {
    this.setData({ actualQty: e.detail.value })
    this.calculateDelta()
  },

  onQtyMinus() {
    const { actualQty } = this.data
    const v = parseInt(actualQty) || 0
    if (v > 0) {
      this.setData({ actualQty: (v - 1).toString() })
      this.calculateDelta()
    }
  },

  onQtyPlus() {
    const { actualQty } = this.data
    const v = parseInt(actualQty) || 0
    this.setData({ actualQty: (v + 1).toString() })
    this.calculateDelta()
  },

  calculateDelta() {
    const { currentItem, actualQty } = this.data
    if (!currentItem || actualQty === '') {
      this.setData({ computedDelta: null, deltaClass: '', submitBtnText: '提交统计结果' })
      return
    }

    const delta = Number(currentItem.quantity) - Number(actualQty)
    let deltaClass = '', submitBtnText = '提交统计结果'

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

    this.setData({ computedDelta: delta, deltaClass, submitBtnText })
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
    wx.vibrateShort({ type: 'medium' })

    try {
      const { specifiedAllocationId, autoLinkEnabled } = this.data
      const itemAllocationId = currentItem.allocation_id || null

      const payload = {
        stock_goods_id: currentItem.id,
        actual_qty: actualQty
      }

      // 仅当自动关联开启 + 全局货位已设置 + 与物品当前货位不同时，才带 allocation_id
      if (autoLinkEnabled && specifiedAllocationId && specifiedAllocationId !== itemAllocationId) {
        payload.allocation_id = specifiedAllocationId
      }

      const result = await request.post('/stock/checking/submit/', payload)
      const delta = Number(result.delta || 0)

      wx.vibrateShort({ type: 'medium' })
      setTimeout(() => { wx.vibrateShort({ type: 'medium' }) }, 100)

      if (delta === 0) {
        wx.showToast({ title: '完成：数量相符 ✓', icon: 'success' })
      } else if (delta > 0) {
        wx.showToast({ title: `完成：短缺 ${Math.abs(delta)}`, icon: 'none' })
      } else {
        wx.showToast({ title: `完成：溢出 ${Math.abs(delta)}`, icon: 'none' })
      }

      await this.fetchProgress()
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

  // ========== 货位相关 ==========

  /**
   * 打开货位弹窗（指定货位 + 当前货位 共用）
   */
  async openAllocationDialog() {
    await this.fetchAllocations()
    this.setData({
      showAllocationDialog: true,
      selectedAllocationId: this.data.specifiedAllocationId,
      allocationSearchKey: '',
      filteredAllocations: this.data.allocationList
    })
  },

  onAutoLinkChange(e) {
    const autoLinkEnabled = e.detail.value
    this.setData({ autoLinkEnabled })
    wx.setStorageSync('stockCheckAllocation', {
      id: this.data.specifiedAllocationId,
      name: this.data.specifiedAllocationName,
      autoLink: autoLinkEnabled
    })
  },

  confirmAllocation() {
    const { selectedAllocationId, allocationList } = this.data
    if (!selectedAllocationId) {
      wx.showToast({ title: '请选择货位', icon: 'none' })
      return
    }
    const selected = allocationList.find(item => item.id === selectedAllocationId)
    if (!selected) {
      wx.showToast({ title: '货位不存在', icon: 'none' })
      return
    }
    this.setData({
      specifiedAllocationId: selected.id,
      specifiedAllocationName: selected.name,
      showAllocationDialog: false,
      allocationSearchKey: '',
      filteredAllocations: []
    })
    wx.setStorageSync('stockCheckAllocation', {
      id: selected.id,
      name: selected.name,
      autoLink: this.data.autoLinkEnabled
    })
    wx.showToast({ title: `已指定货位：${selected.name}`, icon: 'none' })
  },

  // ========== 货位列表获取/搜索/新增 ==========

  async fetchAllocations() {
    try {
      const data = await request.get('/goods/allocation/')
      const list = (data && data.results) || []
      this.setData({ allocationList: list, filteredAllocations: list })
    } catch (err) {
      this.showError(err)
    }
  },

  closeAllocationDialog() {
    this.setData({
      showAllocationDialog: false,
      allocationSearchKey: '',
      filteredAllocations: []
    })
  },

  onAllocationSearchInput(e) {
    const key = e.detail.value.toLowerCase()
    const { allocationList } = this.data
    if (!key) {
      this.setData({ allocationSearchKey: e.detail.value, filteredAllocations: allocationList })
      return
    }
    const filtered = allocationList.filter(item => item.name.toLowerCase().includes(key))
    this.setData({ allocationSearchKey: e.detail.value, filteredAllocations: filtered })
  },

  selectAllocation(e) {
    this.setData({ selectedAllocationId: e.currentTarget.dataset.id })
  },

  openCreateAllocationDialog() {
    this.setData({ showCreateAllocationDialog: true, newAllocationName: '' })
  },

  closeCreateAllocationDialog() {
    this.setData({ showCreateAllocationDialog: false, newAllocationName: '' })
  },

  onNewAllocationInput(e) {
    this.setData({ newAllocationName: e.detail.value })
  },

  async submitCreateAllocation() {
    const { newAllocationName } = this.data
    const userManager = require('../../utils/user')
    if (!newAllocationName.trim()) {
      wx.showToast({ title: '请输入货位名称', icon: 'none' })
      return
    }

    try {
      const currentUser = userManager.getUserInfo()
      const formData = { name: newAllocationName.trim() }
      if (currentUser && currentUser.id) {
        formData.updateuser = currentUser.id
      }

      // request.js 返回 data.data = 后端返回体
      // 新增接口直接返回 { id, name, ... } 对象（不是 { results } 列表）
      const res = await request.post('/goods/allocation/', formData)

      // 兼容两种返回结构
      const newAlloc = res.id ? res : (res.results && res.results[0])
      if (!newAlloc) {
        wx.showToast({ title: '创建成功但未返回数据', icon: 'none' })
        return
      }

      wx.showToast({ title: `货位「${newAlloc.name}」创建成功`, icon: 'success' })

      // 将新货位插入列表前面，弹窗中预选中，只关创建弹窗
      const { allocationList } = this.data
      const updatedList = [newAlloc, ...allocationList]

      this.setData({
        allocationList: updatedList,
        filteredAllocations: updatedList,
        selectedAllocationId: newAlloc.id,
        showCreateAllocationDialog: false,
        // 不关 showAllocationDialog，让用户继续点"确定"
        newAllocationName: ''
      })
    } catch (err) {
      this.showError(err)
    }
  },

  preventBubble() {},

  // ========== 错误提示 ==========
  parseErrorDetail(detail) {
    if (!detail) return '操作失败'
    if (typeof detail === 'string') return detail
    if (typeof detail === 'object' && detail !== null) {
      const msgs = []
      for (const key in detail) {
        if (detail.hasOwnProperty(key)) {
          const v = detail[key]
          const vStr = Array.isArray(v) ? v.join(' ') : (typeof v === 'string' ? v : String(v))
          msgs.push(`${key}: ${vStr}`)
        }
      }
      return msgs.join('\n')
    }
    return String(detail)
  },

  showError(err) {
    const message = (err && err.message) || '操作失败'
    wx.showModal({
      title: '【错误】',
      content: message,
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#fa5151'
    })
  }
})
