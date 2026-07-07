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
    quantityDisplay: '',          // 记录库存（quantity）
    checkQuantityDisplay: '',     // 已盘数量（check_quantity），只读展示
    checkQtyClass: '',            // 已盘数量颜色：qty-red/green/yellow/gray
    isItemExpired: false,
    actualQty: '',               // 实盘库存（本次要追加的数量），默认=max(0,库存−已盘)

    // 提交相关
    startLoading: false,
    submitLoading: false,
    finishLoading: false,

    // 完成统计菜单
    showFinishMenu: false,

    // 连续扫码 toggle
    continuousScan: true,

    // 成功提示浮层
    showSuccessOverlay: false,
    successOverlayMsg: '',

    // 计算属性（预计差值等）
    computedDelta: null,
    deltaPreview: null,         // 记录库存 − 已盘数量 − 实盘库存
    deltaPreviewDisplay: '',    // 格式化后的预计差值显示
    deltaClass: '',             // delta-loss / delta-overage / delta-ok
    submitBtnText: '提交盘点结果',
    isChecked: false,
    showAlreadyCheckedHint: false,  // 已盘点物品二次修改提示

    // 货位相关
    showAllocationDialog: false,
    showCreateAllocationDialog: false,
    allocationList: [],
    filteredAllocations: [],
    allocationSearchKey: '',
    selectedAllocationId: null,
    currentAllocationName: '',
    newAllocationName: '',
    allocationLoading: false,
    // 全局指定货位（跨物品持久化）
    specifiedAllocationId: null,
    specifiedAllocationName: '',
    autoLinkEnabled: true,

    // 未记录列表
    uncheckedList: [],
    uncheckedCount: 0,
    uncheckedPage: 1,
    uncheckedHasMore: false,
    uncheckedLoading: false
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

  async handleStartCheck(force = false) {
    const { progress, startLoading } = this.data
    if (startLoading) return

    const confirmMsg = progress.is_in_progress
      ? `当前有统计进行中（已统计 ${progress.checked} 条，待统计 ${progress.unchecked} 条）。\n重新开始将重置所有物品为"待统计"状态，确认吗？`
      : '将把数量大于0的物品标记为待统计状态'

    const doStart = async () => {
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

    if (force) {
      // 强制重启，不弹确认框
      await doStart()
    } else {
      wx.showModal({
        title: '开始统计',
        content: confirmMsg,
        confirmText: '确认',
        cancelText: '取消',
        success: async (res) => {
          if (res.confirm) {
            await doStart()
          }
        }
      })
    }
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

  /**
   * 跳转手动报溢页面
   */
  goManualOverflow() {
    wx.navigateTo({
      url: '/pages/manual-overflow/manual-overflow'
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
      checkQuantityDisplay: '',
      checkQtyClass: '',
      isItemExpired: false,
      actualQty: '',
      computedDelta: null,
      deltaPreview: null,
      deltaPreviewDisplay: '',
      deltaClass: '',
      submitBtnText: '提交统计结果',
      isChecked: false,
      showAlreadyCheckedHint: false
    })
  },

  async doSearch() {
    const { searchKey } = this.data
    if (!searchKey.trim()) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }

    this.setData({ searchLoading: true, searched: false, currentItem: null })
    // 搜索时隐藏未记录列表
    if (this.data.uncheckedList.length > 0) {
      this.clearUnchecked()
    }

    try {
      const data = await request.get('/stock/goods_search/', {
        key: searchKey
      })

      if (!data || data.length === 0) {
        wx.showToast({ title: '未找到匹配的物品记录', icon: 'none' })
        this.setData({ searched: true, searchResults: [], currentItem: null })
      } else if (data.length === 1) {
        this.selectItem(data[0])
        this.setData({ searched: true, searchResults: this._formatCheckQty(data) })
      } else {
        this.setData({ searched: true, searchResults: this._formatCheckQty(data) })
      }
    } catch (err) {
      this.showError(err)
      this.setData({ searched: true, searchResults: [], currentItem: null })
    } finally {
      this.setData({ searchLoading: false })
    }
  },

  _formatCheckQty(list) {
    return list.map(item => ({
      ...item,
      check_quantity_display: this.formatNum(item.check_quantity || 0)
    }))
  },

  selectItem(itemOrEvent) {
    const item = itemOrEvent.currentTarget ? itemOrEvent.currentTarget.dataset.item : itemOrEvent
    if (!item) return

    const quantity = Number(item.quantity) || 0
    const countedQty = Number(item.check_quantity) || 0

    // 已盘数量颜色：0→灰，<库存→红，==→绿，>→黄
    let checkQtyClass = ''
    if (countedQty === 0) checkQtyClass = 'qty-gray'
    else if (countedQty < quantity) checkQtyClass = 'qty-red'
    else if (countedQty === quantity) checkQtyClass = 'qty-green'
    else checkQtyClass = 'qty-yellow'

    // 实盘库存默认预填 = max(0, 记录库存 − 已盘数量)
    // 首次盘点：= 库存；已盘满后：= 0 方便累加；已盘超：= 0
    const prefill = Math.max(0, quantity - countedQty)
    const actualQty = prefill > 0 ? this.formatNum(prefill) : '0'

    this.setData({
      currentItem: item,
      quantityDisplay: quantity.toString(),
      checkQuantityDisplay: this.formatNum(countedQty),
      checkQtyClass,
      isItemExpired: item.expire_date ? new Date(item.expire_date) < new Date() : false,
      actualQty,
      isChecked: item.ischecked === true,
      showAlreadyCheckedHint: false
    })

    // 自动填入后计算期望差值
    this.calculateDelta()
  },

  closeGoodsCard() {
    this.setData({
      currentItem: null,
      quantityDisplay: '',
      checkQuantityDisplay: '',
      checkQtyClass: '',
      isItemExpired: false,
      actualQty: '',
      deltaPreview: null,
      deltaPreviewDisplay: '',
      deltaClass: '',
      submitBtnText: '提交盘点结果',
      isChecked: false,
      showAlreadyCheckedHint: false
    })
  },

  // ========== 数量相关 ==========
  onActualQtyInput(e) {
    this.setData({ actualQty: e.detail.value })
    this.calculateDelta()
  },

  onQtyMinus() {
    const { actualQty } = this.data
    const v = parseFloat(actualQty) || 0
    this.setData({ actualQty: (v - 1).toString() })
    this.calculateDelta()
  },

  onQtyPlus() {
    const { actualQty } = this.data
    const v = parseFloat(actualQty) || 0
    this.setData({ actualQty: (v + 1).toString() })
    this.calculateDelta()
  },

  calculateDelta() {
    const { currentItem, actualQty, isChecked } = this.data
    if (!currentItem || actualQty === '') {
      this.setData({
        deltaPreview: null,
        deltaPreviewDisplay: '',
        deltaClass: '',
        submitBtnText: '提交盘点结果',
        showAlreadyCheckedHint: false
      })
      return
    }

    const quantity = Number(currentItem.quantity) || 0
    const countedQty = Number(currentItem.check_quantity) || 0
    const inputQty = Number(actualQty)
    if (isNaN(inputQty)) return

    // 预计差值 = 记录库存 − 已盘数量 − 实盘库存（对应后端 delta = recorded_qty − check_quantity）
    const deltaPreview = quantity - countedQty - inputQty
    const absDelta = Math.abs(deltaPreview)
    let deltaClass = '', submitBtnText = '提交盘点结果'

    if (deltaPreview > 0) {
      deltaClass = 'delta-loss'
      submitBtnText = '提交盘点结果（预计报损）'
    } else if (deltaPreview < 0) {
      deltaClass = 'delta-overage'
      submitBtnText = '提交盘点结果（预计报溢）'
    } else {
      deltaClass = 'delta-ok'
      submitBtnText = '✓ 提交盘点结果'
    }

    // 已盘点物品二次修改提示（仅当本次结果与已盘不符时）
    const showAlreadyCheckedHint = isChecked && deltaPreview !== 0

    this.setData({
      deltaPreview,
      deltaPreviewDisplay: absDelta > 0 ? this.formatNum(absDelta) : '0',
      deltaClass,
      submitBtnText,
      showAlreadyCheckedHint
    })
  },

  /**
   * 格式化数字：四舍五入到最多 6 位小数，去除尾 0
   */
  formatNum(n) {
    const rounded = Math.round(Math.abs(n) * 1e6) / 1e6
    let str = rounded.toFixed(6)
    str = str.replace(/\.?0+$/, '')
    return str || '0'
  },

  // ========== 提交统计 ==========
  handleSubmitCheck() {
    const { currentItem, actualQty, submitLoading } = this.data
    if (!currentItem || actualQty === '') {
      wx.showToast({ title: '请输入实盘库存数量', icon: 'none' })
      return
    }
    if (submitLoading) return

    const inputNum = Number(actualQty) || 0
    const stockQty = Number(currentItem.quantity) || 0
    const countedQty = Number(currentItem.check_quantity) || 0

    // 防误操作：实盘库存=0 时二次确认 / 溢出阻断
    if (inputNum === 0) {
      if (stockQty > countedQty) {
        // 已盘不足库存，提交0 → 报损差异部分
        const itemName = currentItem.name || '该物品'
        const lossAmount = stockQty - countedQty
        const displayAmount = this.formatNum(lossAmount)
        const self = this
        setTimeout(() => {
          wx.showModal({
            title: '确认报损',
            content: `实盘库存为 0，将把「${itemName}」的剩余数量【${displayAmount}】全部报损，确认执行？`,
            confirmText: `确认报损 ${displayAmount}`,
            confirmColor: '#ee0a24',
            cancelText: '取消',
            success(res) {
              if (res.confirm) self._doSubmit()
            },
            fail() {
              wx.showModal({
                title: '确认报损',
                content: `将把「${itemName}」的剩余数量【${displayAmount}】进行报损，确认执行？`,
                confirmText: '确认',
                confirmColor: '#ee0a24',
                cancelText: '取消',
                success(res2) { if (res2.confirm) self._doSubmit() }
              })
            }
          })
        }, 50)
        return
      }

      if (stockQty < countedQty) {
        // 已盘已超出库存，提交0会导致后端重复报溢 — 阻断
        wx.showToast({
          title: '已盘数量已超出记录库存，请填写本次实际新增数量',
          icon: 'none',
          duration: 2500
        })
        return
      }

      // stockQty === countedQty，提交0为无害 no-op
    }

    this._doSubmit()
  },

  async _doSubmit() {
    const { currentItem, actualQty } = this.data
    const inputQty = Number(actualQty) || 0

    this.setData({ submitLoading: true })
    wx.vibrateShort({ type: 'medium' })

    try {
      const { specifiedAllocationId, autoLinkEnabled } = this.data
      const itemAllocationId = currentItem.allocation_id || null

      // 实盘库存 = 本次要追加的数量（增量），后端 check_quantity += actual_qty
      const payload = {
        stock_goods_id: currentItem.id,
        actual_qty: String(inputQty)
      }

      // 仅当自动关联开启 + 全局货位已设置 + 与物品当前货位不同时，才带 allocation_id
      if (autoLinkEnabled && specifiedAllocationId && specifiedAllocationId !== itemAllocationId) {
        payload.allocation_id = specifiedAllocationId
      }

      const result = await request.post('/stock/checking/submit/', payload)

      // ── 处理已删除记录（goodsproperty=None 导致物理删除） ──
      if (result.deleted) {
        wx.showToast({ title: result.delete_reason || '该记录已被删除', icon: 'none', duration: 3000 })
        const { searchResults, uncheckedList } = this.data
        this.setData({
          searchResults: searchResults.filter(item => item.id !== currentItem.id),
          uncheckedList: uncheckedList.filter(item => item.id !== currentItem.id),
          currentItem: null
        })
        await this.fetchProgress()
        return
      }

      // ── 使用后端返回的最新数据 ──
      const newQuantity = Number(result.quantity) || 0
      const newCheckQty = result.check_quantity != null ? String(result.check_quantity) : '0'
      const chkNum = parseFloat(newCheckQty) || 0
      const delta = parseFloat(result.delta) || 0
      const isEnabled = result.is_enable
      const sheetType = result.sheet_type  // 'loss' | 'overflow' | null

      wx.vibrateShort({ type: 'medium' })
      setTimeout(() => { wx.vibrateShort({ type: 'medium' }) }, 100)

      // ── 更新搜索结果列表中该物品（用后端最新数据覆盖） ──
      const { searchResults, uncheckedList } = this.data
      const updatedResults = searchResults.map(item => {
        if (item.id === currentItem.id) {
          return {
            ...item,
            ischecked: true,
            quantity: String(newQuantity),
            check_quantity: newCheckQty,
            check_quantity_display: this.formatNum(newCheckQty || 0),
            quantity_display: this.formatNum(newQuantity || 0),
            is_enable: isEnabled,
            allocation_id: result.allocation_id,
            allocation_name: result.allocation_name
          }
        }
        return item
      })

      // 库存归零（is_enable=false）时从搜索结果移除
      const finalResults = isEnabled === false
        ? updatedResults.filter(item => item.id !== currentItem.id)
        : updatedResults

      this.setData({ searchResults: finalResults })

      // ── 更新 currentItem 并重新计算 checkQtyClass 与实盘库存预填 ──
      const newCountedQty = parseFloat(newCheckQty) || 0
      let checkQtyClass = ''
      if (newCountedQty === 0) checkQtyClass = 'qty-gray'
      else if (newCountedQty < newQuantity) checkQtyClass = 'qty-red'
      else if (newCountedQty === newQuantity) checkQtyClass = 'qty-green'
      else checkQtyClass = 'qty-yellow'

      // 提交后预填下次实盘库存 = max(0, 记录库存 − 已盘数量)
      const nextPrefill = Math.max(0, newQuantity - newCountedQty)
      const nextActualQty = nextPrefill > 0 ? this.formatNum(nextPrefill) : '0'

      this.setData({
        currentItem: {
          ...currentItem,
          quantity: String(newQuantity),
          check_quantity: newCheckQty,
          is_enable: isEnabled,
          ischecked: true,
          allocation_id: result.allocation_id,
          allocation_name: result.allocation_name
        },
        quantityDisplay: String(newQuantity),
        checkQuantityDisplay: this.formatNum(newCheckQty || 0),
        checkQtyClass,
        actualQty: nextActualQty,
        isChecked: true
      })

      // 提交成功后从"未记录"列表移除该商品
      const updatedUnchecked = uncheckedList.filter(item => item.id !== currentItem.id)
      if (updatedUnchecked.length !== uncheckedList.length) {
        this.setData({ uncheckedList: updatedUnchecked })
      }

      // ── 成功提示：基于 sheet_type / delta 给更精确的反馈 ──
      const displayQty = this.formatNum(chkNum)
      if (sheetType === 'loss') {
        this.showLargeSuccess(`已盘 ${displayQty}，自动报损 ${this.formatNum(delta)}`)
      } else if (sheetType === 'overflow') {
        this.showLargeSuccess(`已盘 ${displayQty}，自动报溢 ${this.formatNum(Math.abs(delta))}`)
      } else if (delta === 0) {
        this.showLargeSuccess('数量相符 ✓')
      } else {
        this.showLargeSuccess(`已盘 ${displayQty}`)
      }

      await this.fetchProgress()

      // 清空当前物品卡片
      if (this.data.searchResults.length > 0) {
        this.setData({ currentItem: null })
      } else {
        this.setData({ currentItem: null, searchKey: '' })
      }

      // 连续扫码：提交成功后自动打开扫码
      if (this.data.continuousScan) {
        setTimeout(() => { this.handleScan() }, 400)
      }
    } catch (err) {
      this.showError(err)
    } finally {
      this.setData({ submitLoading: false })
    }
  },

  // ========== 完成统计相关 ==========

  /**
   * 显示完成统计/重新开始 菜单
   */
  showFinishMenu() {
    this.setData({ showFinishMenu: !this.data.showFinishMenu })
  },

  /**
   * 隐藏菜单
   */
  hideFinishMenu() {
    this.setData({ showFinishMenu: false })
  },

  /**
   * 连续扫码 toggle：开启后提交成功自动打开扫码
   */
  toggleContinuousScan() {
    const newVal = !this.data.continuousScan
    this.setData({ continuousScan: newVal })
    wx.vibrateShort({ type: 'light' })
    wx.showToast({
      title: newVal ? '连续扫码已开启' : '连续扫码已关闭',
      icon: 'none',
      duration: 1200
    })
  },

  /**
   * 强制重新开始（跳过完成统计）
   */
  handleForceRestart() {
    wx.showModal({
      title: '重新开始',
      content: '将清除本次已统计的数据，并重置统计数量（不会提交报损报溢数量）然后开始新一轮的统计，确定执行吗？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.hideFinishMenu()
          this.handleStartCheck(true)
        }
      }
    })
  },

  /**
   * 完成统计：弹窗确认后调用 finish/ 接口
   */
  handleFinishCheck() {
    wx.showModal({
      title: '完成统计',
      content: '将完成本次统计并清除“已记录”标记，报损与报溢明细请在“账务商品查询”页面查看。\n确认完成统计吗？',
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ finishLoading: true, showFinishMenu: false })
          try {
            const data = await request.post('/stock/checking/finish/')
            wx.showToast({
              title: data.detail || '统计已完成',
              icon: 'success',
              duration: 3000
            })
            await this.fetchProgress()
          } catch (err) {
            this.showError(err)
          } finally {
            this.setData({ finishLoading: false })
          }
        }
      }
    })
  },

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

  // ========== 未记录列表 ==========

  /**
   * 将 /stock/goods/ 嵌套结构扁平化为 goods_search 风格
   */
  _normalizeGoodsItem(nested) {
    const gi = nested.goodsproperty?.goodsinfo || {}
    return {
      id: nested.id,
      info: gi.id || null,
      name: gi.name || '--',
      specification: gi.specification || '--',
      manufacturer: gi.manufacturer_name || '--',
      unit: gi.unit || '',
      barcode: gi.barcode || '',
      batch: nested.batch || '',
      expire_date: nested.expire_date || '',
      production_date: nested.production_date || '',
      quantity: nested.quantity || '0',
      check_quantity: nested.check_quantity || '',
      ischecked: nested.ischecked,
      allocation_name: nested.goodsproperty?.allocation_name || '',
      allocation_id: nested.allocation_id || null,
      quantity_display: this.formatNum(nested.quantity || 0),
      check_quantity_display: this.formatNum(nested.check_quantity || 0)
    }
  },

  async fetchUnchecked() {
    const { uncheckedLoading, uncheckedList } = this.data
    if (uncheckedLoading) return

    // toggle：已展开则关闭
    if (uncheckedList.length > 0) {
      this.clearUnchecked()
      return
    }

    const userManager = require('../../utils/user')
    const userInfo = userManager.getUserInfo()
    const deptId = userInfo?.dept || userInfo?.dept_id || userInfo?.curr_dept_id || ''

    this.setData({ uncheckedLoading: true })
    try {
      const res = await request.get('/stock/goods/', {
        page: 1,
        size: 20,
        dept: deptId,
        ischecked: 'false',
        is_enable: 'true',
        quantity_gt: '0'
      })
      const rawList = (res.results) || []
      const list = rawList.map(item => this._normalizeGoodsItem(item))
      const count = res.count || 0
      const hasMore = list.length < count

      this.setData({
        uncheckedList: list,
        uncheckedCount: count,
        uncheckedPage: 1,
        uncheckedHasMore: hasMore,
        uncheckedLoading: false
      })
    } catch (err) {
      this.showError(err)
      this.setData({ uncheckedLoading: false })
    }
  },

  async loadMoreUnchecked() {
    const { uncheckedLoading, uncheckedHasMore, uncheckedPage } = this.data
    if (uncheckedLoading || !uncheckedHasMore) return

    const userManager = require('../../utils/user')
    const userInfo = userManager.getUserInfo()
    const deptId = userInfo?.dept || userInfo?.dept_id || userInfo?.curr_dept_id || ''

    const nextPage = uncheckedPage + 1
    this.setData({ uncheckedLoading: true })
    try {
      const res = await request.get('/stock/goods/', {
        page: nextPage,
        size: 20,
        dept: deptId,
        ischecked: 'false',
        is_enable: 'true',
        quantity_gt: '0'
      })
      const rawList = (res.results) || []
      const moreItems = rawList.map(item => this._normalizeGoodsItem(item))
      const merged = [...this.data.uncheckedList, ...moreItems]
      const count = res.count || 0
      const hasMore = merged.length < count

      this.setData({
        uncheckedList: merged,
        uncheckedPage: nextPage,
        uncheckedHasMore: hasMore,
        uncheckedLoading: false
      })
    } catch (err) {
      this.showError(err)
      this.setData({ uncheckedLoading: false })
    }
  },

  clearUnchecked() {
    this.setData({ uncheckedList: [], uncheckedCount: 0, uncheckedPage: 1, uncheckedHasMore: false })
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
    if (this.data.allocationLoading) return

    this.setData({ allocationLoading: true })
    try {
      // fields=id_name 触发后端跳过 paginator，返回全量货位列表
      const data = await request.get('/goods/allocation/', { fields: 'id_name' })
      const results = (data && data.results) || data || []

      this.setData({
        allocationList: results,
        filteredAllocations: results,
        allocationLoading: false
      })
    } catch (err) {
      this.showError(err)
      this.setData({ allocationLoading: false })
    }
  },

  closeAllocationDialog() {
    this.setData({
      showAllocationDialog: false,
      allocationSearchKey: '',
      filteredAllocations: [],
      allocationLoading: false
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

  // ========== 成功大勾浮层 ==========
  showLargeSuccess(msg) {
    this.setData({ showSuccessOverlay: true, successOverlayMsg: msg })
    setTimeout(() => {
      this.setData({ showSuccessOverlay: false, successOverlayMsg: '' })
    }, 2000)
  },

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
