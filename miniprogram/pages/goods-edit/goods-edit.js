// pages/goods-edit/goods-edit.js
// 新增 / 编辑 物品信息（对齐 Vue views/goods/GoodsInfo.vue 的「新增商品 / 编辑商品」弹窗）
// 字段多 → 用整页表单代替弹窗，保存后 pop 回上一页并回传数据
const request = require('../../utils/request')
const userManager = require('../../utils/user')

// 贮存方式（与后端 goods/utils.py PRESERVATIONS 一致）
const PRESERVATION_OPTIONS = [
  { value: 1, label: '常温' },
  { value: 2, label: '阴凉' },
  { value: 3, label: '冷藏' }
]

// OTC 类型（与后端 OtcTypeEnum 一致）
const OTC_OPTIONS = [
  { value: 0, label: '非药品' },
  { value: 2, label: 'OTC' },
  { value: 5, label: 'Rx(处方药)' },
  { value: 9, label: '外用药' }
]

const EMPTY_FORM = {
  name: '',
  generalname: '',
  specification: '',
  unit: '',
  barcode: '',

  approvalcode: '',
  manufacturer: null,
  goodscategory: null,
  drugtype: null,

  dosageform: null,
  preservation: 1,
  vatrate: '17',

  is_medicare: false,
  medicarecode: '',
  otctype: null,
  isenable: true
}

Page({
  data: {
    mode: 'create',        // create | edit
    goodsId: null,
    loading: false,
    saving: false,

    form: { ...EMPTY_FORM },
    manufacturerName: '',

    // 本店商品属性（编辑模式下才有）
    hasProperty: false,
    prop: {
      id: null,
      safestock: '2',
      printlabel: false,
      isenable: true,
      allocation: null
    },
    allocationName: '',

    labels: {
      goodscategory: '',
      drugtype: '',
      dosageform: '',
      preservation: '常温',
      otctype: ''
    },

    optionsMap: {
      goodscategory: [],
      drugtype: [],
      dosageform: [],
      preservation: PRESERVATION_OPTIONS,
      otctype: OTC_OPTIONS,
      allocation: []
    },

    // 底部选择弹层
    showSelect: false,
    selectField: '',
    selectTitle: '',
    selectOptions: [],
    selectCurrent: ''
  },

  onLoad(options) {
    const mode = options && options.mode === 'edit' ? 'edit' : 'create'
    const goodsId = options && options.id ? Number(options.id) : null

    this.setData({ mode, goodsId })
    wx.setNavigationBarTitle({ title: mode === 'edit' ? '编辑物品信息' : '新增物品信息' })

    this.fetchSelectOptions()
    if (mode === 'edit' && goodsId) {
      this.loadGoods(goodsId)
    }
  },

  // ========== 选项数据 ==========
  async _loadOptionsList(url) {
    try {
      const data = await request.get(url, { size: 500 })
      const list = (data && data.results) || data || []
      return list.map(it => ({ value: it.id, label: it.name }))
    } catch (err) {
      return []
    }
  },

  async fetchSelectOptions() {
    const [goodscategory, drugtype, dosageform, allocation] = await Promise.all([
      this._loadOptionsList('/goods/category/'),
      this._loadOptionsList('/goods/drug_type/'),
      this._loadOptionsList('/goods/dosage_form/'),
      this._loadOptionsList('/goods/allocation/')
    ])

    this.setData({
      'optionsMap.goodscategory': goodscategory,
      'optionsMap.drugtype': drugtype,
      'optionsMap.dosageform': dosageform,
      'optionsMap.allocation': [{ value: null, label: '不指定货位' }].concat(allocation)
    })
    this.refreshLabels()
  },

  /**
   * 选项可能是 id，也可能是 depth=1 序列化出来的对象 {id, name}
   */
  _pickId(v) {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'object') return v.id !== undefined ? v.id : null
    return v
  },

  refreshLabels() {
    const { form, optionsMap, allocationName } = this.data
    const find = (arr, val) => {
      if (val === null || val === undefined || val === '') return ''
      const hit = (arr || []).find(o => String(o.value) === String(val))
      return hit ? hit.label : ''
    }
    this.setData({
      labels: {
        goodscategory: find(optionsMap.goodscategory, form.goodscategory),
        drugtype: find(optionsMap.drugtype, form.drugtype),
        dosageform: find(optionsMap.dosageform, form.dosageform),
        preservation: find(PRESERVATION_OPTIONS, form.preservation),
        otctype: find(OTC_OPTIONS, form.otctype)
      },
      allocationName: allocationName || ''
    })
  },

  // ========== 编辑模式：加载商品 ==========
  async loadGoods(id) {
    this.setData({ loading: true })
    try {
      // 用列表接口按 ID 检索：/goods/info/<id>/ 详情接口对门店账号无权限，列表接口可用
      const data = await request.get('/goods/info/', { search_key: String(id), size: 50, page: 1 })
      const list = (data && data.results) || []
      const row = list.find(r => Number(r.id) === Number(id))
      if (!row) {
        throw { message: '未找到该商品，请返回重新搜索' }
      }

      const form = {
        name: row.name || '',
        generalname: row.generalname || '',
        specification: row.specification || '',
        unit: row.unit || '',
        barcode: row.barcode || '',

        approvalcode: row.approvalcode || '',
        manufacturer: this._pickId(row.manufacturer),
        goodscategory: this._pickId(row.goodscategory),
        drugtype: this._pickId(row.drugtype),

        dosageform: this._pickId(row.dosageform),
        preservation: this._pickId(row.preservation),
        vatrate: row.vatrate === null || row.vatrate === undefined ? '' : String(parseFloat(row.vatrate)),

        is_medicare: row.is_medicare === true,
        medicarecode: row.medicarecode || '',
        otctype: row.otctype === undefined ? null : row.otctype,
        isenable: row.isenable !== false
      }

      this.setData({
        form,
        manufacturerName: row.manufacturer_display || '',
        loading: false
      })
      this.refreshLabels()
      this.loadProperty(id)
    } catch (err) {
      this.setData({ loading: false })
      wx.showModal({
        title: '❌ 加载失败',
        content: (err && err.message) || '加载商品失败',
        showCancel: false,
        confirmText: '返回',
        success: () => { wx.navigateBack() }
      })
    }
  },

  /**
   * 加载本店商品属性（货位 / 打标签 / 安全库存 / 上架）
   * 属性行在商品首次入库/报溢时由后端自动创建，不存在则不显示该区块
   */
  async loadProperty(goodsId) {
    const { form } = this.data
    const key = (form.barcode || form.name || '').trim()
    if (!key) return

    try {
      const data = await request.get('/goods/property/', { search_key: key, size: 50 })
      const list = (data && data.results) || []
      const row = list.find(r => this._pickId(r.goodsinfo) === Number(goodsId))
      if (!row) {
        this.setData({ hasProperty: false, prop: { ...this.data.prop, id: null } })
        return
      }
      const alloc = row.allocation && typeof row.allocation === 'object' ? row.allocation : null
      this.setData({
        hasProperty: true,
        prop: {
          id: row.id,
          safestock: row.safestock === null || row.safestock === undefined ? '0' : String(row.safestock),
          printlabel: row.printlabel === true,
          isenable: row.isenable !== false,
          allocation: alloc ? alloc.id : null
        },
        allocationName: alloc ? alloc.name : ''
      })
    } catch (err) {
      // 属性拉取失败不阻塞主流程
      this.setData({ hasProperty: false })
    }
  },

  // ========== 表单输入 ==========
  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onFormSwitch(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onPropInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`prop.${field}`]: e.detail.value })
  },

  onPropSwitch(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`prop.${field}`]: e.detail.value })
  },

  // ========== 扫码录入条形码 ==========
  scanBarcode() {
    wx.navigateTo({
      url: '/pages/scan/scan?mode=return',
      events: {
        scanResult: (data) => {
          if (data && data.code) {
            this.setData({ 'form.barcode': String(data.code) })
          }
        }
      }
    })
  },

  // ========== 选择弹层 ==========
  openSelect(e) {
    const field = e.currentTarget.dataset.field
    const titles = {
      goodscategory: '商品类别',
      drugtype: '特殊药品类别',
      dosageform: '剂型',
      preservation: '贮存方式',
      otctype: 'OTC 类型',
      allocation: '选择货位'
    }
    const rawOptions = this.data.optionsMap[field] || []
    const current = field === 'allocation' ? this.data.prop.allocation : this.data.form[field]

    this.setData({
      showSelect: true,
      selectField: field,
      selectTitle: titles[field] || '请选择',
      selectOptions: rawOptions.map(o => ({
        value: o.value === null || o.value === undefined ? '' : String(o.value),
        label: o.label
      })),
      selectCurrent: current === null || current === undefined || current === '' ? '' : String(current)
    })
  },

  closeSelect() {
    this.setData({ showSelect: false })
  },

  onSelectOption(e) {
    const field = this.data.selectField
    const raw = e.currentTarget.dataset.value
    const label = e.currentTarget.dataset.label
    const patch = { showSelect: false }

    if (field === 'allocation') {
      const val = raw === '' || raw === null || raw === undefined ? null : Number(raw)
      patch['prop.allocation'] = val
      patch.allocationName = val === null ? '' : label
    } else {
      const val = raw === '' || raw === null || raw === undefined ? null : Number(raw)
      patch[`form.${field}`] = val
      patch[`labels.${field}`] = val === null ? '' : label
    }

    this.setData(patch)
  },

  preventBubble() {},

  // ========== 生产厂家：选择 / 新增企业 ==========
  chooseEnterprise() {
    wx.navigateTo({
      url: '/pages/enterprise-picker/enterprise-picker',
      events: {
        enterpriseSelected: (data) => {
          if (!data) return
          this.setData({
            'form.manufacturer': data.id,
            manufacturerName: data.name
          })
        }
      }
    })
  },

  // ========== 保存 ==========
  async handleSave() {
    const { form, mode, saving } = this.data
    if (saving) return

    if (!form.name || !form.name.trim()) {
      wx.showToast({ title: '请输入药品名称', icon: 'none' })
      return
    }

    const user = userManager.getUserInfo() || {}
    const userId = user.id || user.user_id
    if (!userId) {
      wx.showToast({ title: '用户信息异常，请重新登录', icon: 'none' })
      return
    }

    const trimOrNull = (v) => {
      const s = (v || '').trim()
      return s === '' ? null : s
    }

    const payload = {
      name: form.name.trim(),
      generalname: trimOrNull(form.generalname),
      specification: trimOrNull(form.specification),
      unit: trimOrNull(form.unit),
      barcode: trimOrNull(form.barcode),

      approvalcode: trimOrNull(form.approvalcode),
      manufacturer: form.manufacturer || null,
      goodscategory: form.goodscategory || null,
      drugtype: form.drugtype || null,

      dosageform: form.dosageform || null,
      preservation: form.preservation || null,
      vatrate: form.vatrate === '' || form.vatrate === null ? null : form.vatrate,

      is_medicare: form.is_medicare === true,
      medicarecode: trimOrNull(form.medicarecode),
      otctype: form.otctype === '' ? null : form.otctype,
      isenable: form.isenable === true,
      updateuser: String(userId)
    }

    this.setData({ saving: true })
    try {
      let goodsId = this.data.goodsId
      if (mode === 'edit' && goodsId) {
        await request.patch(`/goods/info/${goodsId}/`, payload)
      } else {
        const created = await request.post('/goods/info/', payload)
        goodsId = created && created.id ? created.id : null
        if (!goodsId) {
          throw { message: '新增成功但未返回商品 ID，请刷新后查询' }
        }
      }

      // 门店属性保存（仅编辑模式且本店已有属性行）
      if (this.data.hasProperty && this.data.prop.id) {
        await this._saveProperty()
      }

      this._emitBack(goodsId)
    } catch (err) {
      wx.showModal({
        title: '❌ 保存失败',
        content: (err && err.message) || '操作失败',
        showCancel: false,
        confirmText: '我知道了'
      })
    } finally {
      this.setData({ saving: false })
    }
  },

  async _saveProperty() {
    const p = this.data.prop
    const safestock = parseInt(p.safestock, 10)
    try {
      await request.patch(`/goods/property/${p.id}/`, {
        safestock: isNaN(safestock) ? 0 : safestock,
        printlabel: p.printlabel === true,
        isenable: p.isenable === true,
        allocation: p.allocation || null
      })
    } catch (err) {
      wx.showToast({ title: '属性保存失败：' + ((err && err.message) || ''), icon: 'none', duration: 3000 })
    }
  },

  /**
   * 回传上一页并返回：
   * 只回传上一页真正需要的扁平字段（与 /goods/info_search/ 的返回结构保持一致），
   * 避免 depth=1 的嵌套对象把上一页的文本位置渲染成 [object Object]
   */
  _emitBack(goodsId) {
    const f = this.data.form
    const goods = {
      id: goodsId,
      name: f.name.trim(),
      specification: f.specification || '--',
      manufacturer: this.data.manufacturerName || '',
      approvalcode: f.approvalcode || '',
      barcode: f.barcode || ''
    }

    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel()
    if (channel && channel.emit) {
      channel.emit('goodsSaved', { mode: this.data.mode, goods })
    }

    wx.showToast({ title: this.data.mode === 'edit' ? '已保存' : '已新增', icon: 'success' })
    setTimeout(() => { wx.navigateBack() }, 600)
  }
})
